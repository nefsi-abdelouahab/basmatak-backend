import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { BusinessException } from '../common/exceptions/business.exception';
import { AccountToken } from '../common/interfaces/account-token.interface';
import { MediaOwnership } from '../common/seams/media-ownership';
import { MediaCollection, MediaModel } from '../media/schemas/media.schema';
import {
  CreatePortfolioItemDto,
  UpdatePortfolioItemDto,
  ReorderPortfolioDto,
} from './dto/portfolio.dto';
import {
  PortfolioItem,
  PortfolioItemModel,
  PortfolioItemsCollection,
  PortfolioVisibility,
} from './schemas/portfolio-item.schema';

const ITEM_NOT_FOUND = 'PORTFOLIO_ITEM_NOT_FOUND';
const MEDIA_ALREADY_LINKED = 'MEDIA_ALREADY_LINKED';
const REORDER_CONFLICT = 'PORTFOLIO_REORDER_CONFLICT';

/** Media metadata surfaced on portfolio reads (own list + public seam). */
export interface PortfolioMediaInfo {
  mediaId: string;
  type: string;
  mimeType: string | null;
  filename: string | null;
  url: string | null;
}

/** Hydrated portfolio item view (stringified ids + resolved media metadata). */
export interface PortfolioItemView {
  id: string;
  title: string;
  description: string | null;
  mediaIds: string[];
  visibility: PortfolioVisibility;
  order: number;
  typeLabel: string | null;
  tags: string[];
  media: PortfolioMediaInfo[];
}

/**
 * Portfolio service (inventory §2.15, roadmap S14): the volunteer's curated
 * showcase CRUD. Media linkage lives on `media.portfolioItemId`; every
 * mutation that touches both `portfolio_items` and `media` runs inside a Mongo
 * session so the item and its linkage commit or roll back together.
 */
@Injectable()
export class PortfolioService {
  constructor(
    @InjectConnection()
    private readonly connection: Connection,
    @InjectModel(PortfolioItemsCollection)
    private readonly portfolioModel: Model<PortfolioItemModel>,
    @InjectModel(MediaCollection)
    private readonly mediaModel: Model<MediaModel>,
    private readonly ownership: MediaOwnership,
  ) {}

  /***************************************************************************
   * Reads
   **************************************************************************/

  async listMine(account: AccountToken): Promise<PortfolioItemView[]> {
    const rows = await this.portfolioModel
      .find({ volunteerId: new Types.ObjectId(account.sub) })
      .sort({ order: 1 })
      .exec();
    return this.hydrateMedia(rows);
  }

  /***************************************************************************
   * Create (transaction: item + media linkage)
   **************************************************************************/

  async create(
    account: AccountToken,
    dto: CreatePortfolioItemDto,
  ): Promise<PortfolioItemView> {
    const volunteerId = new Types.ObjectId(account.sub);
    const mediaIds = this.uniqueMediaIds(dto.mediaIds ?? []);
    await this.assertMediaOwned(mediaIds, account.sub);

    const session = await this.connection.startSession();
    try {
      const row = await session.withTransaction(async (txn) => {
        await this.assertMediaUnlinked(mediaIds, undefined, txn);

        const max = await this.portfolioModel
          .find({ volunteerId })
          .sort({ order: -1 })
          .limit(1)
          .session(txn)
          .exec();
        const nextOrder = max.length > 0 ? max[0].order + 1 : 0;

        const [item] = await this.portfolioModel.create(
          [
            {
              volunteerId,
              title: dto.title,
              description: dto.description,
              mediaIds,
              visibility: dto.visibility ?? 'public',
              order: nextOrder,
              ...(dto.typeLabel !== undefined
                ? { typeLabel: dto.typeLabel }
                : {}),
              ...(dto.tags !== undefined
                ? { tags: this.normalizeTags(dto.tags) }
                : {}),
            },
          ],
          { session: txn },
        );

        await this.linkMedia(mediaIds, item._id, txn);
        return item;
      });
      const [view] = await this.hydrateMedia([row]);
      return view;
    } finally {
      await session.endSession();
    }
  }

  /***************************************************************************
   * Update (transaction: linkage reconcile)
   **************************************************************************/

  async update(
    account: AccountToken,
    itemId: string,
    dto: UpdatePortfolioItemDto,
  ): Promise<PortfolioItemView> {
    const owner = new Types.ObjectId(account.sub);
    const item = await this.requireOwned(owner, itemId);

    const nextMedia = dto.mediaIds !== undefined ? dto.mediaIds : undefined;
    if (nextMedia !== undefined) {
      await this.assertMediaOwned(this.uniqueMediaIds(nextMedia), account.sub);
    }

    const session = await this.connection.startSession();
    try {
      const updated = await session.withTransaction(async (txn) => {
        const current = await this.portfolioModel
          .findOne({ _id: item._id, volunteerId: owner })
          .session(txn)
          .exec();
        if (!current) {
          throw new BusinessException(
            ITEM_NOT_FOUND,
            'Portfolio item not found',
            404,
          );
        }

        const added =
          nextMedia !== undefined
            ? this.uniqueMediaIds(nextMedia).filter(
                (id) => !current.mediaIds.some((m) => m.toString() === id),
              )
            : [];
        const removed =
          nextMedia !== undefined
            ? current.mediaIds
                .map((m) => m.toString())
                .filter((id) => !this.uniqueMediaIds(nextMedia).includes(id))
            : [];

        if (added.length > 0) {
          await this.assertMediaUnlinked(added, current._id, txn);
        }
        await this.unlinkMedia(removed, current._id, txn);
        await this.linkMedia(added, current._id, txn);

        const set: Partial<PortfolioItem> = {};
        if (dto.title !== undefined) {
          set.title = dto.title;
        }
        if (dto.description !== undefined) {
          set.description = dto.description;
        }
        if (dto.visibility !== undefined) {
          set.visibility = dto.visibility;
        }
        if (dto.typeLabel !== undefined) {
          set.typeLabel = dto.typeLabel;
        }
        if (dto.tags !== undefined) {
          set.tags = this.normalizeTags(dto.tags);
        }
        if (nextMedia !== undefined) {
          set.mediaIds = this.uniqueMediaIds(nextMedia).map(
            (id) => new Types.ObjectId(id),
          );
        }

        const row = await this.portfolioModel
          .findOneAndUpdate(
            { _id: current._id, volunteerId: owner },
            { $set: set },
            { new: true, session: txn },
          )
          .exec();
        if (!row) {
          throw new BusinessException(
            ITEM_NOT_FOUND,
            'Portfolio item not found',
            404,
          );
        }
        return row;
      });
      const [view] = await this.hydrateMedia([updated]);
      return view;
    } finally {
      await session.endSession();
    }
  }

  /***************************************************************************
   * Delete (transaction: item + unlink)
   **************************************************************************/

  async delete(account: AccountToken, itemId: string): Promise<void> {
    const owner = new Types.ObjectId(account.sub);
    const item = await this.requireOwned(owner, itemId);

    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async (txn) => {
        const current = await this.portfolioModel
          .findOne({ _id: item._id, volunteerId: owner })
          .session(txn)
          .exec();
        if (!current) {
          return;
        }
        await this.unlinkMedia(
          current.mediaIds.map((m) => m.toString()),
          current._id,
          txn,
        );
        await this.portfolioModel.deleteOne({ _id: current._id }).session(txn);
      });
    } finally {
      await session.endSession();
    }
  }

  /***************************************************************************
   * Reorder (atomic batch transaction)
   **************************************************************************/

  async reorder(
    account: AccountToken,
    dto: ReorderPortfolioDto,
  ): Promise<PortfolioItemView[]> {
    const volunteerId = new Types.ObjectId(account.sub);
    const submitted = dto.itemIds;

    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async (txn) => {
        const rows = await this.portfolioModel
          .find({ volunteerId })
          .session(txn)
          .exec();
        const owned = new Set(rows.map((row) => row._id.toString()));
        if (
          rows.length !== submitted.length ||
          submitted.some((id) => !owned.has(id))
        ) {
          throw new BusinessException(
            REORDER_CONFLICT,
            'The submitted item list does not match the current portfolio',
            409,
          );
        }
        for (const row of rows) {
          await this.portfolioModel
            .updateOne(
              { _id: row._id, volunteerId },
              { $set: { order: submitted.indexOf(row._id.toString()) } },
              { session: txn },
            )
            .exec();
        }
      });
    } finally {
      await session.endSession();
    }
    return this.listMine(account);
  }

  /***************************************************************************
   * Helpers
   **************************************************************************/

  private async requireOwned(
    volunteerId: Types.ObjectId,
    itemId: string,
  ): Promise<PortfolioItemModel> {
    if (!Types.ObjectId.isValid(itemId)) {
      throw new BusinessException(
        ITEM_NOT_FOUND,
        'Portfolio item not found',
        404,
      );
    }
    const item = await this.portfolioModel
      .findOne({ _id: new Types.ObjectId(itemId), volunteerId })
      .exec();
    if (!item) {
      throw new BusinessException(
        ITEM_NOT_FOUND,
        'Portfolio item not found',
        404,
      );
    }
    return item;
  }

  private async assertMediaOwned(
    mediaIds: string[],
    actorId: string,
  ): Promise<void> {
    for (const mediaId of mediaIds) {
      await this.ownership.assertFor(mediaId, actorId, 'portfolio_item');
    }
  }

  /**
   * Linkage guard: a media row may be attached to at most one portfolio item.
   * With no `exceptItem`, ANY existing `portfolioItemId` rejects; otherwise a
   * row already pointed at the current item is allowed (idempotent re-add).
   */
  private async assertMediaUnlinked(
    mediaIds: string[],
    exceptItem: Types.ObjectId | undefined,
    txn: ClientSession,
  ): Promise<void> {
    if (mediaIds.length === 0) {
      return;
    }
    const linked = await this.mediaModel
      .find({
        _id: { $in: mediaIds },
        portfolioItemId: { $exists: true },
      })
      .session(txn)
      .exec();
    const conflict = linked.some(
      (media) =>
        !exceptItem ||
        (media.portfolioItemId &&
          media.portfolioItemId.toString() !== exceptItem.toString()),
    );
    if (conflict) {
      throw new BusinessException(
        MEDIA_ALREADY_LINKED,
        'A media is already linked to another portfolio item',
        409,
      );
    }
  }

  private async linkMedia(
    mediaIds: string[],
    itemId: Types.ObjectId,
    txn: ClientSession,
  ): Promise<void> {
    if (mediaIds.length === 0) {
      return;
    }
    await this.mediaModel
      .updateMany(
        { _id: { $in: mediaIds.map((id) => new Types.ObjectId(id)) } },
        { $set: { portfolioItemId: itemId } },
      )
      .session(txn)
      .exec();
  }

  private async unlinkMedia(
    mediaIds: string[],
    itemId: Types.ObjectId,
    txn: ClientSession,
  ): Promise<void> {
    if (mediaIds.length === 0) {
      return;
    }
    await this.mediaModel
      .updateMany(
        {
          _id: { $in: mediaIds.map((id) => new Types.ObjectId(id)) },
          portfolioItemId: itemId,
        },
        { $unset: { portfolioItemId: 1 } },
      )
      .session(txn)
      .exec();
  }

  private async hydrateMedia(
    rows: PortfolioItemModel[],
  ): Promise<PortfolioItemView[]> {
    const allIds = rows.flatMap((row) => row.mediaIds.map((m) => m.toString()));
    const media = allIds.length
      ? await this.mediaModel.find({ _id: { $in: allIds } }).exec()
      : [];
    const byId = new Map(media.map((m) => [m._id.toString(), m]));
    return rows.map((row) => {
      const info: PortfolioMediaInfo[] = row.mediaIds.flatMap((m) => {
        const rowMedia = byId.get(m.toString());
        if (!rowMedia) {
          return [];
        }
        return [
          {
            mediaId: rowMedia._id.toString(),
            type: rowMedia.type,
            mimeType: rowMedia.mimeType ?? null,
            filename: rowMedia.filename ?? null,
            url: rowMedia.type === 'link' ? (rowMedia.url ?? null) : null,
          },
        ];
      });
      return {
        id: row._id.toString(),
        title: row.title,
        description: row.description ?? null,
        mediaIds: row.mediaIds.map((m) => m.toString()),
        visibility: row.visibility,
        order: row.order,
        typeLabel: row.typeLabel ?? null,
        tags: row.tags ?? [],
        media: info,
      };
    });
  }

  private uniqueMediaIds(mediaIds: string[]): string[] {
    return [...new Set(mediaIds)];
  }

  /** Canonical tag list: trimmed, empties dropped, deduped. */
  private normalizeTags(tags: string[]): string[] {
    return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
  }
}
