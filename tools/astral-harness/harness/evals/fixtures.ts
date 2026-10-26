export const SUCCESS_STREAM_FIXTURE = [
  'event: start\r\n',
  'data: {"request_id":"fixture-request"}\r\n\r\n',
  'event: delta\n',
  'data: {"text":\n',
  'data: "Sirius is bright."}\n\n',
  'event: done\n',
  'data: {"request_id":"fixture-request"}\n\n',
].join('');

export const ERROR_STREAM_FIXTURE = [
  'event: start\n',
  'data: {"request_id":"fixture-request"}\n\n',
  'event: error\n',
  'data: {"code":"guide_unavailable"}\n\n',
].join('');

export const VALID_ERROR_CODES: Record<string, true> = {
  guide_unavailable: true,
  guide_timeout: true,
  internal_error: true,
};
