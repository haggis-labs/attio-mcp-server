import { beforeEach, describe, expect, it, vi } from 'vitest';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('@/api/lazy-client.js', () => ({
  getLazyAttioClient: () => ({ get }),
}));

import {
  getCallRecording,
  getCallTranscript,
  getMeeting,
  listCallRecordings,
  listMeetings,
} from '@/api/operations/meetings.js';

const meetingId = '123e4567-e89b-12d3-a456-426614174000';
const recordingId = '123e4567-e89b-12d3-a456-426614174001';

describe('meeting API operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists meetings with supported filters and cursor pagination', async () => {
    const meeting = { id: { meeting_id: meetingId }, title: 'Review' };
    get.mockResolvedValueOnce({
      data: {
        data: [meeting],
        pagination: { next_cursor: 'next-page' },
      },
    });

    await expect(
      listMeetings({
        limit: 25,
        cursor: 'current-page',
        linked_object: 'companies',
        linked_record_id: '123e4567-e89b-12d3-a456-426614174002',
        participants: 'one@example.com,two@example.com',
        sort: 'start_desc',
        ends_from: '2026-09-15T00:00:00Z',
        starts_before: '2026-09-16T00:00:00Z',
        timezone: 'America/New_York',
      })
    ).resolves.toEqual({
      data: [meeting],
      pagination: { next_cursor: 'next-page' },
    });

    const path = get.mock.calls[0]?.[0] as string;
    const url = new URL(path, 'https://api.attio.com/v2');
    expect(url.pathname).toBe('/meetings');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      limit: '25',
      cursor: 'current-page',
      linked_object: 'companies',
      linked_record_id: '123e4567-e89b-12d3-a456-426614174002',
      participants: 'one@example.com,two@example.com',
      sort: 'start_desc',
      ends_from: '2026-09-15T00:00:00Z',
      starts_before: '2026-09-16T00:00:00Z',
      timezone: 'America/New_York',
    });
  });

  it('normalizes an empty meeting page', async () => {
    get.mockResolvedValueOnce({ data: {} });

    await expect(listMeetings()).resolves.toEqual({
      data: [],
      pagination: { next_cursor: null },
    });
    expect(get).toHaveBeenCalledWith('/meetings');
  });

  it('gets one meeting', async () => {
    const meeting = { id: { meeting_id: meetingId }, title: 'Review' };
    get.mockResolvedValueOnce({ data: { data: meeting } });

    await expect(getMeeting(meetingId)).resolves.toEqual(meeting);
    expect(get).toHaveBeenCalledWith(`/meetings/${meetingId}`);
  });

  it('lists call recordings for a meeting', async () => {
    const recording = {
      id: { meeting_id: meetingId, call_recording_id: recordingId },
      status: 'completed',
    };
    get.mockResolvedValueOnce({
      data: { data: [recording], pagination: { next_cursor: null } },
    });

    await expect(
      listCallRecordings(meetingId, { limit: 50, cursor: 'cursor-value' })
    ).resolves.toEqual({
      data: [recording],
      pagination: { next_cursor: null },
    });
    expect(get).toHaveBeenCalledWith(
      `/meetings/${meetingId}/call_recordings?limit=50&cursor=cursor-value`
    );
  });

  it('gets one call recording', async () => {
    const recording = {
      id: { meeting_id: meetingId, call_recording_id: recordingId },
      status: 'completed',
    };
    get.mockResolvedValueOnce({ data: { data: recording } });

    await expect(getCallRecording(meetingId, recordingId)).resolves.toEqual(
      recording
    );
    expect(get).toHaveBeenCalledWith(
      `/meetings/${meetingId}/call_recordings/${recordingId}`
    );
  });

  it('gets transcript content and preserves its next cursor', async () => {
    const transcript = {
      id: { meeting_id: meetingId, call_recording_id: recordingId },
      raw_transcript: '[00:00] Speaker: Hello',
    };
    get.mockResolvedValueOnce({
      data: {
        data: transcript,
        pagination: { next_cursor: 'transcript-page-2' },
      },
    });

    await expect(
      getCallTranscript(meetingId, recordingId, 'transcript-page-1')
    ).resolves.toEqual({
      data: transcript,
      pagination: { next_cursor: 'transcript-page-2' },
    });
    expect(get).toHaveBeenCalledWith(
      `/meetings/${meetingId}/call_recordings/${recordingId}/transcript?cursor=transcript-page-1`
    );
  });

  it.each([
    ['meeting', () => getMeeting(meetingId)],
    ['call recording', () => getCallRecording(meetingId, recordingId)],
    ['transcript', () => getCallTranscript(meetingId, recordingId)],
  ])('rejects an empty %s response', async (_name, operation) => {
    get.mockResolvedValueOnce({ data: {} });
    await expect(operation()).rejects.toThrow(/not found/);
  });
});
