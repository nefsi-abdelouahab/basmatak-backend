import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  MAX_HISTORY_CHARS,
  MAX_HISTORY_MESSAGES,
  MAX_MESSAGE_CHARS,
} from '../ai-agent.constants';
import { AiAgentChatRole, AiAgentLocale } from '../ai-agent.types';

@ValidatorConstraint({ name: 'historyWithinCharLimit', async: false })
export class HistoryWithinCharLimitConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (!Array.isArray(value)) return true;
    const total = value.reduce((sum, item) => {
      const content = (item as { content?: unknown } | null)?.content;
      return sum + (typeof content === 'string' ? content.length : 0);
    }, 0);
    return total <= MAX_HISTORY_CHARS;
  }

  defaultMessage(_args: ValidationArguments): string {
    return `history must total at most ${MAX_HISTORY_CHARS} characters`;
  }
}

export function HistoryWithinCharLimit(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return (target: object, propertyName: string | symbol) => {
    registerDecorator({
      target: target.constructor,
      propertyName: String(propertyName),
      options: validationOptions,
      constraints: [],
      validator: HistoryWithinCharLimitConstraint,
    });
  };
}

export class ChatHistoryMessageDto {
  @ApiProperty({ enum: ['user', 'assistant'] })
  @IsIn(['user', 'assistant'])
  role!: AiAgentChatRole;

  @ApiProperty({ minLength: 1, maxLength: MAX_HISTORY_CHARS })
  @IsString()
  @MinLength(1)
  content!: string;
}

export class ChatDto {
  @ApiProperty({
    description: 'User message (1-2,000 characters)',
    minLength: 1,
    maxLength: MAX_MESSAGE_CHARS,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_MESSAGE_CHARS)
  @Matches(/\S/, { message: 'message must not be blank' })
  message!: string;

  @ApiProperty({ enum: ['en', 'ar'] })
  @IsIn(['en', 'ar'])
  locale!: AiAgentLocale;

  @ApiPropertyOptional({
    description:
      'Recent turns, oldest first. Maximum 6 messages and 4,000 characters total.',
    type: [ChatHistoryMessageDto],
    maxItems: MAX_HISTORY_MESSAGES,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_HISTORY_MESSAGES)
  @ValidateNested({ each: true })
  @Type(() => ChatHistoryMessageDto)
  @HistoryWithinCharLimit()
  history?: ChatHistoryMessageDto[];
}
