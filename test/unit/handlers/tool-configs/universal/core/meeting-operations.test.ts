import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listMeetings: vi.fn(),
  getMeeting: vi.fn(),
  listCallRecordings: vi.fn(),
  getCallRecording: vi.fn(),
  getCallTranscript: vi.fn(),
}));

vi.mock('@/api/operations/meetings.js', () => mocks);

const { meetingToolConfigs, meetingToolDefinitions } =
  await import('@/handlers/tool-configs/universal/core/meeting-operations.js');
const { findToolConfig } = await import('@/handlers/tools/registry.js');
const { getToolsListPayload } = await import('@/utils/mcp-discovery.js');

const meetingId = '123e4567-e89b-12d3-a456-426614174000';
const recordingId = '123e4567-e89b-12d3-a456-426614174001';

describe('meeting tool configurations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers five read-only tool definitions', () => {
    expect(Object.keys(meetingToolDefinitions)).toEqual([
      'list_meetings',
      'get_meeting',
      'list_call_recordings',
      'get_call_recording',
      'get_call_transcript',
    ]);
    for (const definition of Object.values(meetingToolDefinitions)) {
      expect(definition.annotations).toMatchObject({
        readOnlyHint: true,
        idempotentHint: true,
        destructiveHint: false,
      });
    }
  });

  it('exposes all five tools through MCP discovery', () => {
    const toolNames = Object.keys(meetingToolDefinitions);
    const discoveredNames = getToolsListPayload().tools.map(
      (tool) => tool.name
    );

    for (const toolName of toolNames) {
      expect(findToolConfig(toolName)?.resourceType).toBe('UNIVERSAL');
      expect(discoveredNames).toContain(toolName);
    }
  });

  it('passes meeting filters to the API operation', async () => {
    mocks.listMeetings.mockResolvedValueOnce({
      data: [],
      pagination: { next_cursor: null },
    });

    await meetingToolConfigs.list_meetings.handler({
      limit: 25,
      linked_object: 'companies',
      linked_record_id: recordingId,
      participants: 'person@example.com',
      sort: 'start_desc',
    });

    expect(mocks.listMeetings).toHaveBeenCalledWith({
      limit: 25,
      cursor: undefined,
      linked_object: 'companies',
      linked_record_id: recordingId,
      participants: 'person@example.com',
      sort: 'start_desc',
      ends_from: undefined,
      starts_before: undefined,
      timezone: undefined,
    });
  });

  it('requires linked meeting filters together', async () => {
    await expect(
      meetingToolConfigs.list_meetings.handler({ linked_object: 'companies' })
    ).rejects.toThrow(/linked_object and linked_record_id/);
    expect(mocks.listMeetings).not.toHaveBeenCalled();
  });

  it('validates list limits before making API calls', async () => {
    await expect(
      meetingToolConfigs.list_meetings.handler({ limit: 201 })
    ).rejects.toThrow(/between 1 and 200/);
    expect(mocks.listMeetings).not.toHaveBeenCalled();
  });

  it('gets a meeting by UUID', async () => {
    mocks.getMeeting.mockResolvedValueOnce({
      id: { meeting_id: meetingId },
      title: 'Review',
    });

    await meetingToolConfigs.get_meeting.handler({ meeting_id: meetingId });

    expect(mocks.getMeeting).toHaveBeenCalledWith(meetingId);
  });

  it('lists call recordings with cursor pagination', async () => {
    mocks.listCallRecordings.mockResolvedValueOnce({
      data: [],
      pagination: { next_cursor: null },
    });

    await meetingToolConfigs.list_call_recordings.handler({
      meeting_id: meetingId,
      limit: 100,
      cursor: 'next',
    });

    expect(mocks.listCallRecordings).toHaveBeenCalledWith(meetingId, {
      limit: 100,
      cursor: 'next',
    });
  });

  it('gets a call recording using both URL identifiers', async () => {
    mocks.getCallRecording.mockResolvedValueOnce({
      id: { meeting_id: meetingId, call_recording_id: recordingId },
    });

    await meetingToolConfigs.get_call_recording.handler({
      meeting_id: meetingId,
      call_recording_id: recordingId,
    });

    expect(mocks.getCallRecording).toHaveBeenCalledWith(meetingId, recordingId);
  });

  it('gets a paginated transcript using both URL identifiers', async () => {
    mocks.getCallTranscript.mockResolvedValueOnce({
      data: {
        id: { meeting_id: meetingId, call_recording_id: recordingId },
        raw_transcript: 'Speaker: Hello',
      },
      pagination: { next_cursor: null },
    });

    await meetingToolConfigs.get_call_transcript.handler({
      meeting_id: meetingId,
      call_recording_id: recordingId,
      cursor: 'next',
    });

    expect(mocks.getCallTranscript).toHaveBeenCalledWith(
      meetingId,
      recordingId,
      'next'
    );
  });

  it.each([
    ['get_meeting', { meeting_id: 'invalid' }],
    [
      'get_call_recording',
      { meeting_id: meetingId, call_recording_id: 'invalid' },
    ],
    [
      'get_call_transcript',
      { meeting_id: 'invalid', call_recording_id: recordingId },
    ],
  ] as const)('rejects invalid UUIDs for %s', async (toolName, args) => {
    await expect(meetingToolConfigs[toolName].handler(args)).rejects.toThrow(
      /must be a UUID/
    );
  });

  it('formats raw transcripts and exposes pagination', () => {
    const formatted = meetingToolConfigs.get_call_transcript.formatResult?.({
      data: {
        id: { meeting_id: meetingId, call_recording_id: recordingId },
        raw_transcript: '[00:00] Speaker: Hello',
      },
      pagination: { next_cursor: 'page-2' },
    });

    expect(formatted).toContain('[00:00] Speaker: Hello');
    expect(formatted).toContain('Next cursor: page-2');
  });

  it('formats transcript segments when raw text is absent', () => {
    const formatted = meetingToolConfigs.get_call_transcript.formatResult?.({
      data: {
        id: { meeting_id: meetingId, call_recording_id: recordingId },
        transcript: [
          {
            start_time: 65,
            speaker: { name: 'Speaker' },
            speech: 'Hello',
          },
        ],
      },
      pagination: { next_cursor: null },
    });

    expect(formatted).toBe('[01:05] Speaker: Hello');
  });
});
