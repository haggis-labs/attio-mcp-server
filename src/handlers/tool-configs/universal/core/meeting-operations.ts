import {
  AttioCallRecording,
  AttioCallTranscript,
  AttioCursorPage,
  AttioMeeting,
  ListMeetingsParams,
  getCallRecording,
  getCallTranscript,
  getMeeting,
  listCallRecordings,
  listMeetings,
} from '@/api/operations/meetings.js';
import { ToolConfig } from '@/handlers/tool-types.js';
import { formatToolDescription } from '@/handlers/tools/standards/index.js';
import { ErrorService } from '@/services/ErrorService.js';
import { isValidUUID } from '@/utils/validation/uuid-validation.js';

type ToolArgs = Record<string, unknown>;

function optionalString(args: ToolArgs, field: string): string | undefined {
  const value = args[field];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function requiredUuid(args: ToolArgs, field: string): string {
  const value = optionalString(args, field);
  if (!value) throw new Error(`${field} is required`);
  if (!isValidUUID(value)) throw new Error(`${field} must be a UUID`);
  return value;
}

function optionalLimit(args: ToolArgs): number | undefined {
  const value = args.limit;
  if (value === undefined) return undefined;
  if (
    !Number.isInteger(value) ||
    (value as number) < 1 ||
    (value as number) > 200
  ) {
    throw new Error('limit must be an integer between 1 and 200');
  }
  return value as number;
}

function listMeetingParams(args: ToolArgs): ListMeetingsParams {
  const linkedObject = optionalString(args, 'linked_object');
  const linkedRecordId = optionalString(args, 'linked_record_id');
  if (Boolean(linkedObject) !== Boolean(linkedRecordId)) {
    throw new Error(
      'linked_object and linked_record_id must be provided together'
    );
  }
  if (linkedRecordId && !isValidUUID(linkedRecordId)) {
    throw new Error('linked_record_id must be a UUID');
  }

  const sort = optionalString(args, 'sort');
  if (sort && sort !== 'start_asc' && sort !== 'start_desc') {
    throw new Error('sort must be start_asc or start_desc');
  }

  return {
    limit: optionalLimit(args),
    cursor: optionalString(args, 'cursor'),
    linked_object: linkedObject,
    linked_record_id: linkedRecordId,
    participants: optionalString(args, 'participants'),
    sort: sort as ListMeetingsParams['sort'],
    ends_from: optionalString(args, 'ends_from'),
    starts_before: optionalString(args, 'starts_before'),
    timezone: optionalString(args, 'timezone'),
  };
}

function formatMeeting(meeting: AttioMeeting): string {
  const id = meeting.id?.meeting_id ?? 'unknown';
  const title = meeting.title || 'Untitled meeting';
  const start = meeting.start?.datetime || 'unknown start';
  const participants = meeting.participants
    ?.map((participant) => participant.email_address)
    .filter(Boolean)
    .join(', ');
  return `- ${title} (${start}) — ID: ${id}${participants ? ` — Participants: ${participants}` : ''}`;
}

function formatRecording(recording: AttioCallRecording): string {
  const id = recording.id?.call_recording_id ?? 'unknown';
  const status = recording.status || 'unknown';
  const created = recording.created_at || 'unknown time';
  return `- Recording ${id} — ${status} — ${created}${recording.web_url ? `\n  ${recording.web_url}` : ''}`;
}

function formatTranscriptSegment(
  segment: NonNullable<AttioCallTranscript['transcript']>[number]
): string {
  const speaker = segment.speaker?.name || 'Unknown speaker';
  const timestamp =
    typeof segment.start_time === 'number'
      ? `[${Math.floor(segment.start_time / 60)
          .toString()
          .padStart(2, '0')}:${Math.floor(segment.start_time % 60)
          .toString()
          .padStart(2, '0')}] `
      : '';
  return `${timestamp}${speaker}: ${segment.speech || ''}`;
}

function formatPageCursor(nextCursor: string | null): string {
  return nextCursor ? `\nNext cursor: ${nextCursor}` : '';
}

export const meetingToolConfigs = {
  list_meetings: {
    name: 'list_meetings',
    handler: async (args: ToolArgs = {}) => {
      try {
        return await listMeetings(listMeetingParams(args));
      } catch (error) {
        throw ErrorService.createUniversalError(
          'list_meetings',
          'meetings',
          error
        );
      }
    },
    formatResult: (page: AttioCursorPage<AttioMeeting>) =>
      page.data.length
        ? `Found ${page.data.length} meetings:\n${page.data.map(formatMeeting).join('\n')}${formatPageCursor(page.pagination.next_cursor)}`
        : `Found 0 meetings${formatPageCursor(page.pagination.next_cursor)}`,
    structuredOutput: (page: AttioCursorPage<AttioMeeting>) => ({ ...page }),
  } as ToolConfig,
  get_meeting: {
    name: 'get_meeting',
    handler: async (args: ToolArgs = {}) => {
      try {
        return await getMeeting(requiredUuid(args, 'meeting_id'));
      } catch (error) {
        throw ErrorService.createUniversalError(
          'get_meeting',
          'meetings',
          error
        );
      }
    },
    formatResult: (meeting: AttioMeeting) => formatMeeting(meeting).slice(2),
    structuredOutput: (meeting: AttioMeeting) => ({ ...meeting }),
  } as ToolConfig,
  list_call_recordings: {
    name: 'list_call_recordings',
    handler: async (args: ToolArgs = {}) => {
      try {
        return await listCallRecordings(requiredUuid(args, 'meeting_id'), {
          limit: optionalLimit(args),
          cursor: optionalString(args, 'cursor'),
        });
      } catch (error) {
        throw ErrorService.createUniversalError(
          'list_call_recordings',
          'call_recordings',
          error
        );
      }
    },
    formatResult: (page: AttioCursorPage<AttioCallRecording>) =>
      page.data.length
        ? `Found ${page.data.length} call recordings:\n${page.data.map(formatRecording).join('\n')}${formatPageCursor(page.pagination.next_cursor)}`
        : `Found 0 call recordings${formatPageCursor(page.pagination.next_cursor)}`,
    structuredOutput: (page: AttioCursorPage<AttioCallRecording>) => ({
      ...page,
    }),
  } as ToolConfig,
  get_call_recording: {
    name: 'get_call_recording',
    handler: async (args: ToolArgs = {}) => {
      try {
        return await getCallRecording(
          requiredUuid(args, 'meeting_id'),
          requiredUuid(args, 'call_recording_id')
        );
      } catch (error) {
        throw ErrorService.createUniversalError(
          'get_call_recording',
          'call_recordings',
          error
        );
      }
    },
    formatResult: (recording: AttioCallRecording) =>
      formatRecording(recording).slice(2),
    structuredOutput: (recording: AttioCallRecording) => ({ ...recording }),
  } as ToolConfig,
  get_call_transcript: {
    name: 'get_call_transcript',
    handler: async (args: ToolArgs = {}) => {
      try {
        return await getCallTranscript(
          requiredUuid(args, 'meeting_id'),
          requiredUuid(args, 'call_recording_id'),
          optionalString(args, 'cursor')
        );
      } catch (error) {
        throw ErrorService.createUniversalError(
          'get_call_transcript',
          'transcripts',
          error
        );
      }
    },
    formatResult: (result: {
      data: AttioCallTranscript;
      pagination: { next_cursor: string | null };
    }) => {
      const content =
        result.data.raw_transcript?.trim() ||
        result.data.transcript?.map(formatTranscriptSegment).join('\n') ||
        'Transcript is empty.';
      return `${content}${formatPageCursor(result.pagination.next_cursor)}`;
    },
  } as ToolConfig,
};

const uuidProperty = (description: string) => ({
  type: 'string' as const,
  format: 'uuid',
  description,
});

const cursorProperty = {
  type: 'string' as const,
  minLength: 1,
  description: 'Opaque cursor returned by the previous page.',
};

const limitProperty = {
  type: 'integer' as const,
  minimum: 1,
  maximum: 200,
  default: 50,
  description: 'Maximum number of results to return.',
};

const readOnlyAnnotations = {
  readOnlyHint: true,
  idempotentHint: true,
  destructiveHint: false,
};

export const meetingToolDefinitions = {
  list_meetings: {
    name: 'list_meetings',
    description: formatToolDescription({
      capability:
        'List meetings with date, participant, linked-record, sorting, and cursor filters.',
      boundaries: 'create or update meetings; read-only.',
      constraints:
        'The Attio token requires meeting:read and record_permission:read scopes.',
      recoveryHint:
        'Use meeting_id from a result with list_call_recordings or get_meeting.',
    }),
    inputSchema: {
      type: 'object',
      properties: {
        limit: limitProperty,
        cursor: cursorProperty,
        linked_object: {
          type: 'string',
          minLength: 1,
          description:
            'Object slug or ID. Must be provided with linked_record_id.',
        },
        linked_record_id: uuidProperty(
          'Record UUID. Must be provided with linked_object.'
        ),
        participants: {
          type: 'string',
          minLength: 1,
          description: 'Comma-separated participant email addresses.',
        },
        sort: {
          type: 'string',
          enum: ['start_asc', 'start_desc'],
          default: 'start_asc',
        },
        ends_from: {
          type: 'string',
          description: 'Include meetings ending at or after this timestamp.',
        },
        starts_before: {
          type: 'string',
          description: 'Include meetings starting before this timestamp.',
        },
        timezone: {
          type: 'string',
          default: 'UTC',
          description: 'Timezone used for all-day meeting date filters.',
        },
      },
      additionalProperties: false,
    },
    annotations: readOnlyAnnotations,
  },
  get_meeting: {
    name: 'get_meeting',
    description: formatToolDescription({
      capability: 'Retrieve one meeting by UUID.',
      boundaries: 'create or update meetings; read-only.',
      constraints:
        'Requires meeting_id and an Attio token with meeting:read and record_permission:read.',
      recoveryHint: 'Use list_meetings to find the meeting_id.',
    }),
    inputSchema: {
      type: 'object',
      properties: { meeting_id: uuidProperty('Meeting UUID.') },
      required: ['meeting_id'],
      additionalProperties: false,
    },
    annotations: readOnlyAnnotations,
  },
  list_call_recordings: {
    name: 'list_call_recordings',
    description: formatToolDescription({
      capability: 'List call recordings attached to a meeting.',
      boundaries: 'create or modify recordings; read-only.',
      constraints:
        'Requires meeting_id and meeting:read plus call_recording:read scopes.',
      recoveryHint: 'Use list_meetings to find the meeting_id.',
    }),
    inputSchema: {
      type: 'object',
      properties: {
        meeting_id: uuidProperty('Meeting UUID.'),
        limit: limitProperty,
        cursor: cursorProperty,
      },
      required: ['meeting_id'],
      additionalProperties: false,
    },
    annotations: readOnlyAnnotations,
  },
  get_call_recording: {
    name: 'get_call_recording',
    description: formatToolDescription({
      capability: 'Retrieve one call recording and its status by UUID.',
      boundaries:
        'retrieve transcript content or modify recordings; read-only.',
      constraints:
        'Requires meeting_id, call_recording_id, meeting:read, and call_recording:read.',
      recoveryHint:
        'Use list_call_recordings for the meeting to find call_recording_id.',
    }),
    inputSchema: {
      type: 'object',
      properties: {
        meeting_id: uuidProperty('Meeting UUID.'),
        call_recording_id: uuidProperty('Call recording UUID.'),
      },
      required: ['meeting_id', 'call_recording_id'],
      additionalProperties: false,
    },
    annotations: readOnlyAnnotations,
  },
  get_call_transcript: {
    name: 'get_call_transcript',
    description: formatToolDescription({
      capability:
        'Retrieve transcript text for one meeting call recording, with cursor pagination.',
      boundaries: 'modify recordings or transcripts; read-only.',
      constraints:
        'Requires meeting_id, call_recording_id, meeting:read, and call_recording:read.',
      recoveryHint:
        'Use list_call_recordings first; pass next_cursor back as cursor if returned.',
    }),
    inputSchema: {
      type: 'object',
      properties: {
        meeting_id: uuidProperty('Meeting UUID.'),
        call_recording_id: uuidProperty('Call recording UUID.'),
        cursor: cursorProperty,
      },
      required: ['meeting_id', 'call_recording_id'],
      additionalProperties: false,
    },
    annotations: readOnlyAnnotations,
  },
};
