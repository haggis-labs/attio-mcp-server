/**
 * Read-only meeting, call recording, and transcript operations.
 */

import { getLazyAttioClient } from '@/api/lazy-client.js';
import { callWithRetry, RetryConfig } from '@/api/operations/retry.js';

export interface AttioActorReference {
  type: string;
  id: string;
}

export interface AttioMeetingParticipant {
  status?: string;
  is_organizer?: boolean;
  email_address?: string;
}

export interface AttioMeetingLinkedRecord {
  object_slug?: string;
  object_id?: string;
  record_id: string;
}

export interface AttioMeeting {
  id: {
    workspace_id?: string;
    meeting_id: string;
  };
  title?: string;
  description?: string;
  is_all_day?: boolean;
  start?: { datetime?: string; timezone?: string };
  end?: { datetime?: string; timezone?: string };
  participants?: AttioMeetingParticipant[];
  linked_records?: AttioMeetingLinkedRecord[];
  created_at?: string;
  created_by_actor?: AttioActorReference;
}

export interface AttioCallRecording {
  id: {
    workspace_id?: string;
    meeting_id: string;
    call_recording_id: string;
  };
  status?: string;
  web_url?: string;
  created_by_actor?: AttioActorReference;
  created_at?: string;
}

export interface AttioTranscriptSegment {
  speech?: string;
  start_time?: number;
  end_time?: number;
  speaker?: { name?: string };
}

export interface AttioCallTranscript {
  id: {
    workspace_id?: string;
    meeting_id: string;
    call_recording_id: string;
  };
  transcript?: AttioTranscriptSegment[];
  raw_transcript?: string;
  web_url?: string;
}

export interface AttioCursorPage<T> {
  data: T[];
  pagination: {
    next_cursor: string | null;
  };
}

export interface ListMeetingsParams {
  limit?: number;
  cursor?: string;
  linked_object?: string;
  linked_record_id?: string;
  participants?: string;
  sort?: 'start_asc' | 'start_desc';
  ends_from?: string;
  starts_before?: string;
  timezone?: string;
}

interface AttioListResponse<T> {
  data?: T[];
  pagination?: { next_cursor?: string | null };
}

interface AttioSingleResponse<T> {
  data?: T;
  pagination?: { next_cursor?: string | null };
}

function normalizePage<T>(response: AttioListResponse<T>): AttioCursorPage<T> {
  return {
    data: Array.isArray(response.data) ? response.data : [],
    pagination: {
      next_cursor: response.pagination?.next_cursor ?? null,
    },
  };
}

function appendOptionalParam(
  params: URLSearchParams,
  name: string,
  value: string | number | undefined
): void {
  if (value !== undefined) params.set(name, String(value));
}

export async function listMeetings(
  options: ListMeetingsParams = {},
  retryConfig?: Partial<RetryConfig>
): Promise<AttioCursorPage<AttioMeeting>> {
  const params = new URLSearchParams();
  appendOptionalParam(params, 'limit', options.limit);
  appendOptionalParam(params, 'cursor', options.cursor);
  appendOptionalParam(params, 'linked_object', options.linked_object);
  appendOptionalParam(params, 'linked_record_id', options.linked_record_id);
  appendOptionalParam(params, 'participants', options.participants);
  appendOptionalParam(params, 'sort', options.sort);
  appendOptionalParam(params, 'ends_from', options.ends_from);
  appendOptionalParam(params, 'starts_before', options.starts_before);
  appendOptionalParam(params, 'timezone', options.timezone);

  const query = params.toString();
  const path = query ? `/meetings?${query}` : '/meetings';

  return callWithRetry(async () => {
    const response =
      await getLazyAttioClient().get<AttioListResponse<AttioMeeting>>(path);
    return normalizePage(response.data);
  }, retryConfig);
}

export async function getMeeting(
  meetingId: string,
  retryConfig?: Partial<RetryConfig>
): Promise<AttioMeeting> {
  const response = await callWithRetry(
    () =>
      getLazyAttioClient().get<AttioSingleResponse<AttioMeeting>>(
        `/meetings/${meetingId}`
      ),
    retryConfig
  );
  if (!response.data.data) {
    throw new Error(`Meeting '${meetingId}' not found`);
  }
  return response.data.data;
}

export async function listCallRecordings(
  meetingId: string,
  options: { limit?: number; cursor?: string } = {},
  retryConfig?: Partial<RetryConfig>
): Promise<AttioCursorPage<AttioCallRecording>> {
  const params = new URLSearchParams();
  appendOptionalParam(params, 'limit', options.limit);
  appendOptionalParam(params, 'cursor', options.cursor);
  const query = params.toString();
  const path = `/meetings/${meetingId}/call_recordings${query ? `?${query}` : ''}`;

  return callWithRetry(async () => {
    const response =
      await getLazyAttioClient().get<AttioListResponse<AttioCallRecording>>(
        path
      );
    return normalizePage(response.data);
  }, retryConfig);
}

export async function getCallRecording(
  meetingId: string,
  callRecordingId: string,
  retryConfig?: Partial<RetryConfig>
): Promise<AttioCallRecording> {
  const response = await callWithRetry(
    () =>
      getLazyAttioClient().get<AttioSingleResponse<AttioCallRecording>>(
        `/meetings/${meetingId}/call_recordings/${callRecordingId}`
      ),
    retryConfig
  );
  if (!response.data.data) {
    throw new Error(`Call recording '${callRecordingId}' not found`);
  }
  return response.data.data;
}

export async function getCallTranscript(
  meetingId: string,
  callRecordingId: string,
  cursor?: string,
  retryConfig?: Partial<RetryConfig>
): Promise<{
  data: AttioCallTranscript;
  pagination: { next_cursor: string | null };
}> {
  const params = new URLSearchParams();
  appendOptionalParam(params, 'cursor', cursor);
  const query = params.toString();
  const path = `/meetings/${meetingId}/call_recordings/${callRecordingId}/transcript${query ? `?${query}` : ''}`;

  const response = await callWithRetry(
    () =>
      getLazyAttioClient().get<AttioSingleResponse<AttioCallTranscript>>(path),
    retryConfig
  );
  if (!response.data.data) {
    throw new Error(
      `Transcript for call recording '${callRecordingId}' not found`
    );
  }
  return {
    data: response.data.data,
    pagination: {
      next_cursor: response.data.pagination?.next_cursor ?? null,
    },
  };
}
