/**
 * lib/runtime/tools/catalog-recording.ts — what Composio ACTUALLY published,
 * on one day, for every tool this runtime maps.
 *
 * THIS FILE IS A RECORDING, NOT A SPECIFICATION. Nothing here is a decision, a
 * requirement or a shape anybody in this repository chose. It is a transcript of
 * HTTP responses. If it disagrees with the runtime, the runtime is wrong; if it
 * disagrees with Composio's catalog tomorrow, THIS FILE is wrong and must be
 * re-recorded rather than edited to agree.
 *
 *   Captured        2026-08-02T13:20Z (Asia/Singapore, 2026-08-02 21:20)
 *   Endpoint        GET https://backend.composio.dev/api/v3.1/tools/<SLUG>
 *                   authenticated with `x-api-key: $COMPOSIO_API_KEY`
 *   Read back as    @composio/core 0.14.1 -> @composio/client 0.1.0-alpha.76
 *   Subject         every slug lib/runtime/tools/capabilities.ts maps, all 14
 *
 * THE FAILURE THIS FILE EXISTS TO REMOVE. Until it was recorded, every schema
 * lib/runtime/verify/tools.ts had ever shown ./schema.ts was a literal SOMEBODY
 * WROTE to match what they believed Composio returns. The parser was therefore
 * proved to agree with its author. It did. They were both wrong, and the checks
 * could not say so, because the same belief was on both sides of the assertion.
 * Four of the differences the recording found are the reason it is committed:
 *
 *   1. THE ENDPOINT WAS THE WRONG ONE. `/api/v3/tools/<SLUG>` — the obvious URL,
 *      and the one the hand-written fixture was modelled on — answers with tool
 *      version `00000000_00`, a legacy base. `@composio/client`'s `tools.retrieve`,
 *      which is what `getRawComposioToolBySlug` and therefore this runtime call,
 *      requests `/api/v3.1/tools/<SLUG>` and receives `20260721_00`. The two are
 *      DIFFERENT TOOLS wearing one slug: different arguments, different required
 *      lists. Recording v3 would have re-proved the parser against a shape the
 *      runtime never sees, which is the original mistake with a URL on it.
 *   2. GMAIL_SEND_EMAIL PUBLISHES NO `required` AT ALL at the version the runtime
 *      executes. Not `["recipient_email","body"]` (that is v3's legacy answer),
 *      not `["recipient_email"]` (that is what the hand-written fixture claimed).
 *      The tool this whole schema mechanism was built around declares every one of
 *      its ten arguments optional, so the gate's missing-argument arm never fires
 *      for it and the prompt has no REQUIRED line to show the model. See the
 *      no-required notice `renderSchemaForPrompt` now emits.
 *   3. SLACK_SEND_MESSAGE HAS NO `text` ARGUMENT. It takes `markdown_text`,
 *      `fallback_text` and `blocks`. The hand-written fixture published
 *      `{ channel, text }`, so the checks blessed an argument list Composio would
 *      have dropped on the floor — the exact failure ./schema.ts exists to catch,
 *      hidden inside the thing doing the catching.
 *   4. TWO MAPPED SLUGS ARE NOT THERE. HUBSPOT_FETCH_CONTACT_DETAILS_BY_ID and
 *      HUBSPOT_READ_A_PAGE_OF_DEALS answer 404 on the endpoint the SDK reads (they
 *      survive only on legacy v3). `hubspot.contacts.read` and `hubspot.deals.read`
 *      therefore cannot be schema-checked at all, so every call through them
 *      refuses. That is the correct behaviour and it was invisible: a fake catalog
 *      answers for whatever it is asked about. Their 404 bodies are recorded
 *      VERBATIM below, because a recording that quietly dropped the two failures
 *      would be a recording that agrees with us again.
 *
 * WHAT IS RECORDED, AND WHAT IS NOT. `inputParameters` holds `input_parameters`
 * byte for byte as the endpoint returned it. It is typed `unknown` on purpose:
 * this file asserts NOTHING about the shape, because the moment it declares one it
 * stops being evidence and starts being the second guess it replaced.
 * `parseToolInputSchema` is the only thing entitled to have an opinion about it.
 *
 * ONE TRANSFORMATION SITS BETWEEN THIS AND THE PARSER, and it was measured rather
 * than assumed: @composio/core Zod-parses the response into camelCase before
 * `ComposioToolDefinition.inputParameters` reaches ./schema.ts, and that parse
 * strips unknown keys. Across all twelve reachable tools it strips exactly two —
 * `human_parameter_name` and `human_parameter_description`, eleven occurrences in
 * total — and ./schema.ts reads neither. Everything the parser does read (`type`,
 * `properties`, `required`, `additionalProperties`, `description`, `enum`, `anyOf`)
 * survives unchanged, so feeding this recording straight to the parser is faithful.
 *
 * NO NETWORK, EVER, FROM HERE. This is data. `lib/runtime/verify/tools.ts` serves
 * it through the fake SDK, which is what keeps the tool checks in the default
 * sweep on a machine with no COMPOSIO_API_KEY.
 *
 * TO RE-RECORD: fetch each slug in `mappedCapabilities()` from the endpoint named
 * above and replace the array wholesale, including the capture date. Do not hand-
 * edit an entry. An entry somebody adjusted to make a check pass is worth less
 * than no entry at all, because it looks like evidence.
 */

/**
 * One response, kept whole.
 *
 * `status` is here rather than implied because a 404 IS the recording for two of
 * these slugs, and an interface with no room for a failure would have forced the
 * capture to drop them — leaving a fixture that covers fourteen capabilities and a
 * runtime where two of them cannot work.
 */
export interface RecordedTool {
  /** The Composio slug requested, exactly as capabilities.ts maps it. */
  readonly slug: string;
  /** The HTTP status the endpoint answered with. 200 or 404, as recorded. */
  readonly status: number;
  /** The tool version Composio resolved this unpinned request to, or null. */
  readonly version: string | null;
  /** Composio's own sentence about the tool, or null when it published none. */
  readonly description: string | null;
  /**
   * `input_parameters`, verbatim. `unknown` because this file makes no claim
   * about it — see the header. Null when the request did not return a tool.
   */
  readonly inputParameters: unknown;
  /** The error body, verbatim, when `status` is not 200. Null otherwise. */
  readonly errorBody: unknown;
}

/** When the array below was pulled. Stated as data so a check can print it. */
export const COMPOSIO_CATALOG_RECORDED_AT = "2026-08-02T13:20Z";

/** The URL the array below came from, and the one the SDK reads at run time. */
export const COMPOSIO_CATALOG_ENDPOINT =
  "GET https://backend.composio.dev/api/v3.1/tools/<SLUG>";

/** The SDK whose transform sits between this recording and the parser. */
export const COMPOSIO_CATALOG_SDK = "@composio/core 0.14.1";

/** The recording itself. One entry per mapped slug, in capture order. */
export const COMPOSIO_CATALOG_RECORDING: readonly RecordedTool[] = [
  {
    "slug": "GMAIL_LIST_THREADS",
    "status": 200,
    "version": "20260721_00",
    "description": "Retrieves a list of email threads from a Gmail account, identified by `user_id` (email address or 'me'), supporting filtering and pagination. Spam and trash are excluded by default unless explicitly targeted via `label:spam` or `label:trash` in the query.",
    "inputParameters": {
      "type": "object",
      "title": "ListThreadsRequest",
      "properties": {
        "query": {
          "type": "string",
          "title": "Query",
          "default": "",
          "examples": [
            "is:unread",
            "from:john.doe@example.com",
            "subject:important"
          ],
          "description": "Filter for threads, using Gmail search query syntax (e.g., 'from:user@example.com is:unread'). Supported operators include `from:`, `to:`, `subject:`, `label:`, `is:unread`, `has:attachment`, `after:`, `before:`. Dates must use `YYYY/MM/DD` format; date operators are UTC-based. Exact subject phrases require quotes (e.g., `subject:'meeting notes'`).",
          "human_parameter_name": "Query",
          "human_parameter_description": "Use this field to search for specific threads based on criteria like sender or subject."
        },
        "user_id": {
          "type": "string",
          "title": "User Id",
          "default": "me",
          "examples": [
            "me",
            "user@example.com"
          ],
          "description": "The user's email address or 'me' to specify the authenticated Gmail account.",
          "human_parameter_name": "User ID",
          "human_parameter_description": "Provide the email address or 'me' to refer to your own Gmail account."
        },
        "verbose": {
          "type": "boolean",
          "title": "Verbose",
          "default": false,
          "examples": [
            true,
            false
          ],
          "description": "If false, returns threads with basic fields (id, snippet, historyId). If true, returns threads with complete message details including headers, body, attachments, and metadata for each message in the thread. Combining `verbose=true` with large `max_results` produces very large responses; keep `max_results` modest when verbose is enabled.",
          "human_parameter_name": "Verbose",
          "human_parameter_description": "Choose whether you want just the basic thread info or detailed message content."
        },
        "page_token": {
          "type": "string",
          "title": "Page Token",
          "default": "",
          "examples": [
            "abcPageToken123"
          ],
          "description": "Token from a previous response to retrieve a specific page of results; omit for the first page.",
          "human_parameter_name": "Page Token",
          "human_parameter_description": "If you're looking for more threads, use this token to get the next set of results."
        },
        "max_results": {
          "type": "integer",
          "title": "Max Results",
          "default": 10,
          "maximum": 500,
          "minimum": 1,
          "examples": [
            "10",
            "50",
            "100"
          ],
          "description": "Maximum number of threads to return. Hard cap is ~500 per call. For full mailbox coverage, loop using `nextPageToken` via `page_token` until absent.",
          "human_parameter_name": "Max Results",
          "human_parameter_description": "Specify how many threads you would like to see in the response, up to 500."
        }
      }
    },
    "errorBody": null
  },
  {
    "slug": "GMAIL_FETCH_MESSAGE_BY_THREAD_ID",
    "status": 200,
    "version": "20260721_00",
    "description": "Retrieves messages from a Gmail thread using its `thread_id`, where the thread must be accessible by the specified `user_id`. Returns a `messages` array; `thread_id` is not echoed in the response. Message order is not guaranteed — sort by `internalDate` to find oldest/newest. Check `labelIds` per message to filter drafts. Concurrent bulk calls may trigger 403 `userRateLimitExceeded` or 429; cap concurrency ~10 and use exponential backoff.",
    "inputParameters": {
      "type": "object",
      "title": "FetchMessageByThreadIdRequest",
      "required": [
        "thread_id"
      ],
      "properties": {
        "user_id": {
          "type": "string",
          "title": "User Id",
          "default": "me",
          "examples": [
            "me",
            "user@example.com"
          ],
          "description": "The email address of the user.",
          "human_parameter_name": "User ID",
          "human_parameter_description": "The email address or identifier of the user whose mailbox you want to access. Use 'me' to access your own mailbox."
        },
        "thread_id": {
          "type": "string",
          "title": "Thread Id",
          "examples": [
            "19bf77729bcb3a44",
            "msg-f:19bf77729bcb3a44"
          ],
          "description": "Hexadecimal thread ID from Gmail API (e.g., '19bf77729bcb3a44'). Obtain from GMAIL_LIST_THREADS or GMAIL_FETCH_EMAILS. Prefixes like 'msg-f:' or 'thread-f:' are auto-stripped. Legacy Gmail web UI IDs (e.g., 'FMfcgzQfBZdVqKZcSVBhqwWLKWCtDdWQ') are NOT supported - use the API thread ID instead. Deduplicate thread_ids before calling when multiple listed messages share the same threadId to avoid redundant calls.",
          "human_parameter_name": "Thread ID",
          "human_parameter_description": "The unique hexadecimal identifier of the email thread (e.g., '19bf77729bcb3a44'). Obtain this from GMAIL_LIST_THREADS or GMAIL_FETCH_EMAILS actions. Legacy Gmail web UI IDs are not supported."
        },
        "page_token": {
          "type": "string",
          "title": "Page Token",
          "default": "",
          "examples": [
            "CiAKGhIKJdealEffectivelyPageToken"
          ],
          "description": "Opaque page token for fetching a specific page of messages if results are paginated. Iterate calls by passing the returned `nextPageToken` until it is absent; stopping early will miss messages in long threads.",
          "human_parameter_name": "Page Token",
          "human_parameter_description": "Use this token to navigate to a specific set of messages if there are many. It helps in paginating through results."
        }
      }
    },
    "errorBody": null
  },
  {
    "slug": "GMAIL_CREATE_EMAIL_DRAFT",
    "status": 200,
    "version": "20260721_00",
    "description": "Creates a Gmail email draft. While all fields are optional per the Gmail API, practical validation requires at least one of recipient_email, cc, or bcc and at least one of subject or body. Supports To/Cc/Bcc recipients, subject, plain/HTML body (ensure `is_html=True` for HTML), attachments, and threading. Returns a draft_id that must be used as-is with GMAIL_SEND_DRAFT — synthetic or stale IDs will fail. When creating a draft reply to an existing thread (thread_id provided), leave subject empty to stay in the same thread; setting a subject will create a NEW thread instead. HTTP 429 may occur on rapid creation/send sequences; apply exponential backoff.",
    "inputParameters": {
      "type": "object",
      "title": "CreateEmailDraftRequest",
      "properties": {
        "cc": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "title": "Cc",
          "default": [],
          "examples": [
            [
              "cc.recipient1@example.com",
              "CC User <cc.recipient2@example.com>"
            ]
          ],
          "description": "Carbon Copy (CC) recipients' email addresses. Each must be a valid email address (e.g., 'user@example.com') or display name format (e.g., 'John Doe <user@example.com>'). Plain names without email addresses are NOT valid. Optional for drafts (recipients can be added later before sending)."
        },
        "bcc": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "title": "Bcc",
          "default": [],
          "examples": [
            [
              "bcc.recipient@example.com",
              "BCC User <bcc.user@example.com>"
            ]
          ],
          "description": "Blind Carbon Copy (BCC) recipients' email addresses. Each must be a valid email address (e.g., 'user@example.com') or display name format (e.g., 'Bob Jones <user@example.com>'). Plain names without email addresses are NOT valid. Optional for drafts (recipients can be added later before sending)."
        },
        "body": {
          "type": "string",
          "title": "Body",
          "examples": [
            "Hello Team,\n\nPlease find the attached report for your review.\n\nBest regards,\nYour Name",
            "<h1>Meeting Confirmation</h1><p>This email confirms our meeting scheduled for next Tuesday.</p>"
          ],
          "description": "Email body content (plain text or HTML); `is_html` must be True if HTML. Optional - drafts can be created without a body and edited later before sending. Can also be provided as 'message_body'.",
          "human_parameter_name": "Email Body",
          "human_parameter_description": "Write the main content of your email here. This can be plain text or HTML, depending on your preference."
        },
        "is_html": {
          "type": "boolean",
          "title": "Is Html",
          "default": false,
          "examples": [
            true,
            false
          ],
          "description": "Set to True if `body` is already formatted HTML. When False, plain text newlines are auto-converted to <br/> tags. Both modes result in HTML email; this flag controls whether the body content is treated as raw HTML or plain text that gets HTML formatting applied.",
          "human_parameter_name": "Is HTML?",
          "human_parameter_description": "Set to True if your email body is already HTML. When False, plain text formatting (newlines, tabs) will be automatically converted to HTML for proper display."
        },
        "subject": {
          "type": "string",
          "title": "Subject",
          "examples": [
            "Project Update Q3",
            "Meeting Reminder"
          ],
          "description": "Email subject line. Optional - drafts can be created without a subject and edited later before sending. When creating a draft reply to an existing thread (thread_id provided), leave this empty to stay in the same thread. Setting a subject will create a NEW thread instead.",
          "human_parameter_name": "Subject",
          "human_parameter_description": "Enter the subject of your email. This helps the recipient understand what the email is about."
        },
        "user_id": {
          "type": "string",
          "title": "User Id",
          "default": "me",
          "examples": [
            "me",
            "user@example.com"
          ],
          "description": "User's email address or 'me' for the authenticated user.",
          "human_parameter_name": "User ID",
          "human_parameter_description": "Provide the user ID or the email address of the user. Use 'me' to refer to the currently authenticated user."
        },
        "thread_id": {
          "type": "string",
          "title": "Thread Id",
          "examples": [
            "17f45ec49a9c3f1b"
          ],
          "description": "ID of an existing Gmail thread to reply to; omit for new thread. If the thread ID is invalid or inaccessible, the draft will be created as a new thread instead of failing.",
          "human_parameter_name": "Thread ID",
          "human_parameter_description": "If you want to reply to an ongoing conversation, provide the thread ID here. Leave it blank for a new message."
        },
        "attachment": {
          "anyOf": [
            {
              "type": "object",
              "title": "FileUploadable",
              "required": [
                "name",
                "mimetype",
                "s3key"
              ],
              "properties": {
                "name": {
                  "type": "string",
                  "title": "Name",
                  "examples": [
                    "document.pdf",
                    "image.jpg",
                    "report.docx"
                  ],
                  "description": "The filename that will be used when uploading the file to the destination service"
                },
                "s3key": {
                  "type": "string",
                  "title": "S3Key",
                  "examples": [
                    "47563/gmail/GET_ATTACHMENT/response/12345"
                  ],
                  "description": "The S3 key of a publicly accessible file, typically returned from a previous download action that stored the file in S3. This key references an existing file that can be uploaded to another service."
                },
                "mimetype": {
                  "type": "string",
                  "title": "Mimetype",
                  "examples": [
                    "application/pdf",
                    "image/jpeg",
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  ],
                  "description": "The MIME type of the file"
                }
              },
              "file_uploadable": true
            },
            {
              "type": "array",
              "items": {
                "type": "object",
                "title": "FileUploadable",
                "required": [
                  "name",
                  "mimetype",
                  "s3key"
                ],
                "properties": {
                  "name": {
                    "type": "string",
                    "title": "Name",
                    "examples": [
                      "document.pdf",
                      "image.jpg",
                      "report.docx"
                    ],
                    "description": "The filename that will be used when uploading the file to the destination service"
                  },
                  "s3key": {
                    "type": "string",
                    "title": "S3Key",
                    "examples": [
                      "47563/gmail/GET_ATTACHMENT/response/12345"
                    ],
                    "description": "The S3 key of a publicly accessible file, typically returned from a previous download action that stored the file in S3. This key references an existing file that can be uploaded to another service."
                  },
                  "mimetype": {
                    "type": "string",
                    "title": "Mimetype",
                    "examples": [
                      "application/pdf",
                      "image/jpeg",
                      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    ],
                    "description": "The MIME type of the file"
                  }
                },
                "file_uploadable": true
              }
            }
          ],
          "title": "Attachment",
          "description": "File(s) to attach to the email. Accepts a single file or a list of files. Total message size including base64-encoded attachments must be under 25 MB; use shareable links (e.g., Google Drive) for larger files.",
          "human_parameter_name": "Attachment(s)",
          "human_parameter_description": "Upload file(s) you want to include with the email. Can be a single file or multiple files."
        },
        "recipient_email": {
          "type": "string",
          "title": "Recipient Email",
          "examples": [
            "john.doe@example.com",
            "John Doe <john.doe@example.com>"
          ],
          "description": "Primary recipient's email address. Must be a valid email address (e.g., 'user@example.com') or display name format (e.g., 'John Doe <user@example.com>'). A plain name without an email address (e.g., 'John Doe') is NOT valid - the '@' symbol and domain are required. Optional for drafts (recipients can be added later before sending). Use extra_recipients if you want to send to multiple recipients."
        },
        "extra_recipients": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "title": "Extra Recipients",
          "default": [],
          "examples": [
            [
              "jane.doe@example.com",
              "Jane Doe <jane.doe@example.com>"
            ]
          ],
          "description": "Additional 'To' recipients' email addresses (not Cc or Bcc). Each must be a valid email address (e.g., 'user@example.com'), display name format (e.g., 'Jane Doe <user@example.com>'), or 'me' for the authenticated user. Plain names without email addresses are NOT valid. Should only be used if recipient_email is also provided."
        }
      }
    },
    "errorBody": null
  },
  {
    "slug": "GMAIL_SEND_EMAIL",
    "status": 200,
    "version": "20260721_00",
    "description": "Sends an email via Gmail API using the authenticated user's Google profile display name. Sends immediately and is irreversible — confirm recipients, subject, body, and attachments before calling. At least one of 'to' (or 'recipient_email'), 'cc', or 'bcc' must be provided. At least one of subject or body must be provided. Requires `is_html=True` if the body contains HTML. All common file types including PNG, JPG, PDF, MP4, etc. are supported as attachments. Gmail API limits total message size to ~25 MB after base64 encoding. To reply in an existing thread, use GMAIL_REPLY_TO_THREAD instead. No scheduled send support; enforce timing externally.",
    "inputParameters": {
      "type": "object",
      "title": "SendEmailRequest",
      "properties": {
        "cc": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "title": "Cc",
          "default": [],
          "examples": [
            [
              "manager@example.com",
              "teamlead@example.com"
            ]
          ],
          "description": "Carbon Copy (CC) recipients' email addresses. At least one of 'to'/'recipient_email', 'cc', or 'bcc' must be provided.",
          "human_parameter_name": "CC recipients' email addresses",
          "human_parameter_description": "Provide email addresses of people you want to inform about the email without them being the main recipient."
        },
        "bcc": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "title": "Bcc",
          "default": [],
          "examples": [
            [
              "auditor@example.com"
            ]
          ],
          "description": "Blind Carbon Copy (BCC) recipients' email addresses. At least one of 'to'/'recipient_email', 'cc', or 'bcc' must be provided.",
          "human_parameter_name": "BCC recipients' email addresses",
          "human_parameter_description": "Enter email addresses of people you want to receive the email without the main recipients knowing."
        },
        "body": {
          "type": "string",
          "title": "Body",
          "examples": [
            "Hello team, let's discuss the project updates tomorrow.",
            "<h1>Welcome!</h1><p>Thank you for signing up.</p>",
            ""
          ],
          "description": "Email content (plain text or HTML). Either subject or body must be provided for the email to be sent. If HTML, `is_html` must be `True`.",
          "human_parameter_name": "Email content",
          "human_parameter_description": "Write the main message of your email here. It can be plain text or formatted HTML."
        },
        "is_html": {
          "type": "boolean",
          "title": "Is Html",
          "default": false,
          "description": "Set to `True` if the email body contains HTML tags.",
          "human_parameter_name": "Does the email body contain HTML?",
          "human_parameter_description": "Indicate whether the content of your email is formatted with HTML."
        },
        "subject": {
          "type": "string",
          "title": "Subject",
          "examples": [
            "Project Update Meeting",
            "Your Weekly Newsletter"
          ],
          "description": "Subject line of the email. Either subject or body must be provided for the email to be sent.",
          "human_parameter_name": "Email subject line",
          "human_parameter_description": "This is the title of your email that summarizes its content."
        },
        "user_id": {
          "type": "string",
          "title": "User Id",
          "default": "me",
          "examples": [
            "user@example.com",
            "me"
          ],
          "description": "User's email address; the literal 'me' refers to the authenticated user.",
          "human_parameter_name": "User ID",
          "human_parameter_description": "This is the email address of the user whose mailbox you want to access. You can use 'me' to refer to your own mailbox."
        },
        "attachment": {
          "anyOf": [
            {
              "type": "object",
              "title": "FileUploadable",
              "required": [
                "name",
                "mimetype",
                "s3key"
              ],
              "properties": {
                "name": {
                  "type": "string",
                  "title": "Name",
                  "examples": [
                    "document.pdf",
                    "image.jpg",
                    "report.docx"
                  ],
                  "description": "The filename that will be used when uploading the file to the destination service"
                },
                "s3key": {
                  "type": "string",
                  "title": "S3Key",
                  "examples": [
                    "47563/gmail/GET_ATTACHMENT/response/12345"
                  ],
                  "description": "The S3 key of a publicly accessible file, typically returned from a previous download action that stored the file in S3. This key references an existing file that can be uploaded to another service."
                },
                "mimetype": {
                  "type": "string",
                  "title": "Mimetype",
                  "examples": [
                    "application/pdf",
                    "image/jpeg",
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  ],
                  "description": "The MIME type of the file"
                }
              },
              "file_uploadable": true
            },
            {
              "type": "array",
              "items": {
                "type": "object",
                "title": "FileUploadable",
                "required": [
                  "name",
                  "mimetype",
                  "s3key"
                ],
                "properties": {
                  "name": {
                    "type": "string",
                    "title": "Name",
                    "examples": [
                      "document.pdf",
                      "image.jpg",
                      "report.docx"
                    ],
                    "description": "The filename that will be used when uploading the file to the destination service"
                  },
                  "s3key": {
                    "type": "string",
                    "title": "S3Key",
                    "examples": [
                      "47563/gmail/GET_ATTACHMENT/response/12345"
                    ],
                    "description": "The S3 key of a publicly accessible file, typically returned from a previous download action that stored the file in S3. This key references an existing file that can be uploaded to another service."
                  },
                  "mimetype": {
                    "type": "string",
                    "title": "Mimetype",
                    "examples": [
                      "application/pdf",
                      "image/jpeg",
                      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    ],
                    "description": "The MIME type of the file"
                  }
                },
                "file_uploadable": true
              }
            }
          ],
          "title": "Attachment",
          "description": "File(s) to attach. Accepts a single file or a list of files. IMPORTANT: mimetype MUST contain a '/' separator - single words like 'pdf' or 'new' are invalid. Gmail API limits: total message size must not exceed ~25 MB after base64 encoding. Omit or set to null for no attachment. Empty attachment objects (with all fields empty/whitespace) are treated as no attachment.",
          "human_parameter_name": "File(s) to attach",
          "human_parameter_description": "If you want to send file(s) with your email, provide them here. Can be a single file or a list of files. The mimetype must be in 'type/subtype' format (e.g., 'application/pdf' for PDFs, 'image/png' for PNG files). Total size of all attachments should be under 20 MB before encoding."
        },
        "from_email": {
          "type": "string",
          "title": "From Email",
          "examples": [
            "alias@example.com",
            "marketing@company.com"
          ],
          "description": "Sender email address for the 'From' header. Use this to send from a verified alias configured in Gmail's 'Send mail as' settings. When not provided, the authenticated user's primary email address is used. The alias must be verified in Gmail settings before use.",
          "human_parameter_name": "Sender email address (alias)",
          "human_parameter_description": "Specify a 'Send mail as' alias email address to send from. Must be pre-configured and verified in Gmail settings. Leave empty to use your primary email."
        },
        "recipient_email": {
          "type": "string",
          "title": "Recipient Email",
          "examples": [
            "john@doe.com",
            "me"
          ],
          "description": "Primary recipient's email address. You can also use 'to' as an alias for this parameter. At least one of 'to'/'recipient_email', 'cc', or 'bcc' must be provided. Use extra_recipients if you want to send to multiple recipients. Use the special value 'me' to send to your own authenticated email address. Must be a full user@domain address; 'me' is not valid here and will fail.",
          "human_parameter_name": "Primary recipient's email address",
          "human_parameter_description": "Enter the main email address of the person you want to send the email to. Use 'me' to send to yourself."
        },
        "extra_recipients": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "title": "Extra Recipients",
          "default": [],
          "examples": [
            [
              "jane.doe@example.com",
              "support@example.com"
            ]
          ],
          "description": "Additional 'To' recipients' email addresses (not Cc or Bcc). Should only be used if recipient_email is also provided.",
          "human_parameter_name": "Additional 'To' recipients' email addresses",
          "human_parameter_description": "List extra email addresses for other recipients you want to send the email to."
        }
      }
    },
    "errorBody": null
  },
  {
    "slug": "GOOGLECALENDAR_EVENTS_LIST",
    "status": 200,
    "version": "20260721_00",
    "description": "Returns events on the specified calendar. TIMEZONE WARNING: When using timeMin/timeMax with UTC timestamps (ending in 'Z'), the time window is interpreted in UTC regardless of the calendar's timezone. For example, querying '2026-01-19T00:00:00Z' to '2026-01-20T00:00:00Z' on a calendar in America/Los_Angeles (UTC-8) covers 2026-01-18 4pm to 2026-01-19 4pm local time, potentially missing events on the intended local date. To query for a specific local date, use timestamps with the appropriate timezone offset in timeMin/timeMax (e.g., '2026-01-19T00:00:00-08:00' for PST).",
    "inputParameters": {
      "type": "object",
      "title": "EventsListRequest",
      "properties": {
        "q": {
          "type": "string",
          "title": "Q",
          "description": "Free text search terms to find events that match these terms in various fields. Optional.",
          "human_parameter_name": "Search Terms",
          "human_parameter_description": "Keywords to search your events by, such as titles, locations, or notes."
        },
        "iCalUID": {
          "type": "string",
          "title": "I Cal Uid",
          "description": "Specifies an event ID in the iCalendar format to be provided in the response. Optional. Use this if you want to search for an event by its iCalendar ID.",
          "human_parameter_name": "iCal UID",
          "human_parameter_description": "The iCalendar UID of a specific event you want to fetch. Use this when you already know the event’s UID."
        },
        "orderBy": {
          "type": "string",
          "title": "Order By",
          "description": "The order of the events returned in the result. Optional. The default is an unspecified, stable order. Acceptable values are: \"startTime\", \"updated\". When set to \"startTime\", singleEvents must be true. The action automatically sets singleEvents=true when orderBy='startTime'.",
          "human_parameter_name": "Order By",
          "human_parameter_description": "Choose how to sort the results, such as by start time or by last updated time."
        },
        "timeMax": {
          "type": "string",
          "title": "Time Max",
          "description": "Upper bound (exclusive) for an event's start time to filter by. Optional. If unset, no start-time upper bound is applied. Must be an RFC3339 timestamp with mandatory time zone offset (e.g., 2011-06-03T10:00:00-07:00 or 2011-06-03T10:00:00Z). Milliseconds may be provided but are ignored. If timeMin is set, timeMax must be greater than timeMin. TIMEZONE WARNING: If using UTC times (ending in 'Z') but the calendar is in a different timezone, the time window may not align with local calendar dates. For example, '2026-01-19T00:00:00Z' to '2026-01-20T00:00:00Z' covers 2026-01-18 4pm to 2026-01-19 4pm in America/Los_Angeles (UTC-8). To query a specific local date, use timestamps with the appropriate local timezone offset (e.g., '2026-01-19T00:00:00-08:00' for PST). NOTE: Natural language expressions like 'today', 'tomorrow', 'next week' are NOT supported.",
          "human_parameter_name": "Time Max",
          "human_parameter_description": "Only include events that start before this date and time. Set this to cap your results at an end point."
        },
        "timeMin": {
          "type": "string",
          "title": "Time Min",
          "description": "Lower bound (exclusive) for an event's end time to filter by. Optional. If unset, no end-time lower bound is applied. Must be an RFC3339 timestamp with mandatory time zone offset (e.g., 2011-06-03T10:00:00-07:00 or 2011-06-03T10:00:00Z). Milliseconds may be provided but are ignored. If timeMax is set, timeMin must be smaller than timeMax. TIMEZONE WARNING: If using UTC times (ending in 'Z') but the calendar is in a different timezone, the time window may not align with local calendar dates. For example, '2026-01-19T00:00:00Z' to '2026-01-20T00:00:00Z' covers 2026-01-18 4pm to 2026-01-19 4pm in America/Los_Angeles (UTC-8). To query a specific local date, use timestamps with the appropriate local timezone offset (e.g., '2026-01-19T00:00:00-08:00' for PST). NOTE: Natural language expressions like 'today', 'tomorrow', 'next week' are NOT supported.",
          "human_parameter_name": "Time Min",
          "human_parameter_description": "Only include events that end after this date and time. Use this to focus on upcoming or recent events."
        },
        "timeZone": {
          "type": "string",
          "title": "Time Zone",
          "description": "Time zone used in the response for formatting event times. Optional. Use an IANA time zone identifier (e.g., America/Los_Angeles). Defaults to the user's primary time zone. Offsets (e.g., '-03:00', 'UTC+0') and abbreviations (e.g., 'IST', 'PST') are invalid. NOTE: This parameter only affects how event times are displayed in the response. It does NOT change how timeMin/timeMax filtering is interpreted. To query a specific local date, use timestamps with the appropriate timezone offset directly in timeMin/timeMax (e.g., '2026-01-19T00:00:00-08:00').",
          "human_parameter_name": "Time Zone",
          "human_parameter_description": "Pick the time zone to display event times in. Leave blank to use your default time zone."
        },
        "pageToken": {
          "type": "string",
          "title": "Page Token",
          "description": "Opaque pagination token from a previous response's nextPageToken field. Must be the exact string returned by the API - do not use placeholder values like 'NEXT', 'next', '1', '2', etc. Omit this parameter entirely for the first page of results. Optional.",
          "human_parameter_name": "Page Token",
          "human_parameter_description": "If you're browsing through pages, paste the next page token from a previous response to continue."
        },
        "syncToken": {
          "type": "string",
          "title": "Sync Token",
          "description": "Token from nextSyncToken to return only entries changed since the last list. Cannot be combined with iCalUID, orderBy, privateExtendedProperty, q, sharedExtendedProperty, timeMin, timeMax, or updatedMin. Deletions since the previous list are always included; showDeleted cannot be false in this mode. The action automatically removes conflicting parameters when syncToken is provided.",
          "human_parameter_name": "Sync Token",
          "human_parameter_description": "Use the sync token from a previous list to fetch only changes since then. Ideal for incremental syncing."
        },
        "calendarId": {
          "type": "string",
          "title": "Calendar Id",
          "default": "primary",
          "examples": [
            "primary"
          ],
          "description": "Calendar identifier. Use \"primary\" for the user's main calendar, or a calendar ID from the user's accessible calendar list. Arbitrary email addresses will NOT work - the calendar must exist in the user's calendar list. Use GOOGLECALENDAR_LIST_CALENDARS to retrieve valid calendar IDs. Defaults to \"primary\". Empty strings will be treated as \"primary\". Do NOT use Composio internal IDs like connectedAccountId (which start with \"ca_\") - these will be automatically replaced with \"primary\".",
          "human_parameter_name": "Calendar ID",
          "human_parameter_description": "The calendar you want to get events from. Use 'primary' for your main calendar or paste a specific calendar ID."
        },
        "eventTypes": {
          "type": "string",
          "title": "Event Types",
          "description": "Event types to return. Optional. Pass a single value only. If unset, returns all event types. Acceptable values are: \"birthday\", \"default\", \"focusTime\", \"fromGmail\", \"outOfOffice\", \"workingLocation\".",
          "human_parameter_name": "Event Types",
          "human_parameter_description": "Choose which kind of event to include (e.g., default, birthday, outOfOffice). Leave blank to include all types."
        },
        "maxResults": {
          "type": "integer",
          "title": "Max Results",
          "maximum": 2500,
          "minimum": 1,
          "description": "Maximum number of events returned on one result page. The number of events in the resulting page may be less than this value, or none at all, even if there are more events matching the query. Incomplete pages can be detected by a non-empty nextPageToken field in the response. By default the value is 250 events. The page size can never be larger than 2500 events. Optional. Must be >= 1 if provided.",
          "human_parameter_name": "Max Results",
          "human_parameter_description": "How many events to return per page. Use this to control the page size of your results."
        },
        "updatedMin": {
          "type": "string",
          "title": "Updated Min",
          "description": "Lower bound for an event's last modification time (RFC3339). When specified, entries deleted since this time are always included regardless of showDeleted. Optional.",
          "human_parameter_name": "Updated Min",
          "human_parameter_description": "Only include events that were last updated after this date and time. Helpful for checking recent changes."
        },
        "showDeleted": {
          "type": "boolean",
          "title": "Show Deleted",
          "description": "Include cancelled events (status=\"cancelled\"). Optional; default is false. This surfaces cancelled (soft-deleted) events, not items in the Trash. When syncToken or updatedMin is used, deletions since those markers are included regardless of showDeleted. Recurring interaction: if singleEvents=false and showDeleted=false, cancelled instances of a recurring series may still be included; if showDeleted=true and singleEvents=true, only single deleted instances (not parent series) are returned.",
          "human_parameter_name": "Include Cancelled",
          "human_parameter_description": "Include events that were canceled so you can see what was removed alongside active events."
        },
        "maxAttendees": {
          "type": "integer",
          "title": "Max Attendees",
          "minimum": 1,
          "description": "The maximum number of attendees to include in the response. If there are more than the specified number of attendees, only the participant is returned. Optional. Must be >= 1 if provided.",
          "human_parameter_name": "Max Attendees",
          "human_parameter_description": "Limit how many attendee details are returned per event. Helpful to keep responses smaller for large meetings."
        },
        "singleEvents": {
          "type": "boolean",
          "title": "Single Events",
          "description": "Whether to expand recurring events into instances and only return single one-off events and instances of recurring events. Optional. The default is False.",
          "human_parameter_name": "Single Events",
          "human_parameter_description": "Return individual event instances instead of recurring series summaries. Useful for a simple date-ordered list."
        },
        "alwaysIncludeEmail": {
          "type": "boolean",
          "title": "Always Include Email",
          "description": "Deprecated and ignored.",
          "human_parameter_name": "Always Include Email",
          "human_parameter_description": "This setting is deprecated and not used anymore. You can leave it empty."
        },
        "showHiddenInvitations": {
          "type": "boolean",
          "title": "Show Hidden Invitations",
          "description": "Whether to include hidden invitations in the result. Optional. The default is False. Hidden invitations are events where your attendee entry has responseStatus='needsAction' and attendees[].self==true. When true, such invitations are included.",
          "human_parameter_name": "Show Hidden Invitations",
          "human_parameter_description": "Include invitations you haven’t responded to yet that are normally hidden."
        },
        "sharedExtendedProperty": {
          "type": "string",
          "title": "Shared Extended Property",
          "description": "Extended properties constraint specified as propertyName=value. Matches only shared properties. This parameter might be repeated multiple times to return events that match all given constraints.",
          "human_parameter_name": "Shared Extended Property",
          "human_parameter_description": "Filter for events with a specific shared extended property (format: name=value). Use this for shared custom metadata."
        },
        "privateExtendedProperty": {
          "type": "string",
          "title": "Private Extended Property",
          "description": "Extended properties constraint specified as propertyName=value. Matches only private properties. This parameter might be repeated multiple times to return events that match all given constraints.",
          "human_parameter_name": "Private Extended Property",
          "human_parameter_description": "Filter for events with a specific private extended property (format: name=value). Use this if you add custom private tags to events."
        },
        "composio_replaced_calendar_id": {
          "type": "string",
          "title": "Composio Replaced Calendar Id",
          "description": "Internal field to track if calendarId was replaced"
        }
      }
    },
    "errorBody": null
  },
  {
    "slug": "GOOGLECALENDAR_FIND_FREE_SLOTS",
    "status": 200,
    "version": "20260721_00",
    "description": "Finds both free and busy time slots in Google Calendars for specified calendars within a defined time range. If `time_min` is not provided, defaults to the current timestamp in the specified timezone. If `time_max` is not provided, defaults to 23:59:59 of the day specified in `time_min` (if provided), otherwise defaults to 23:59:59 of the current day in the specified timezone. Returns busy intervals and calculates free slots by finding gaps between busy periods; `time_min` must precede `time_max` if both are provided. This action retrieves free and busy time slots for the specified calendars over a given time period. It analyzes the busy intervals from the calendars and provides calculated free slots based on the gaps in the busy periods. Returned free slots are unfiltered by duration; callers must filter intervals to those fully containing the required meeting length. No event metadata (titles, descriptions, links) is returned; use GOOGLECALENDAR_EVENTS_LIST for event details.",
    "inputParameters": {
      "type": "object",
      "title": "FindFreeSlotsRequest",
      "properties": {
        "items": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "title": "Items",
          "default": [
            "primary"
          ],
          "examples": [
            [
              "primary"
            ],
            [
              "primary",
              "user@example.com"
            ]
          ],
          "description": "List of calendar identifiers to query for free/busy information. Pass as a simple list of strings, e.g., ['primary'] or ['primary', 'user@example.com']. Valid values include: 'primary' (authenticated user's main calendar), calendar IDs from the user's calendar list (typically ending in @group.calendar.google.com), or email addresses of users whose free/busy information you want to query. The FreeBusy API will return error information for any calendars that are not accessible or invalid in the response under the 'errors' key for each calendar. Calendars omitted from `items` or inaccessible are treated as free (not unknown), which can silently produce incorrect availability results.",
          "human_parameter_name": "Calendar Items",
          "human_parameter_description": "Which calendars you want to check. Use 'primary' for your main calendar, or use calendar IDs from your calendar list."
        },
        "time_max": {
          "type": "string",
          "title": "Time Max",
          "examples": [
            "2024-12-06T18:00:00Z",
            "2024,12,06,18,00,00",
            "2024-12-06 18:00:00"
          ],
          "description": "End datetime for the query interval. Accepts ISO, comma-separated, or simple datetime formats. If provided without an explicit timezone, it is interpreted in the specified `timezone`. If not provided, defaults to 23:59:59 of the day specified in `time_min` (if provided), otherwise defaults to 23:59:59 of the current day in the specified `timezone`. Maximum span between time_min and time_max is approximately 90 days per Google Calendar freeBusy API limit. `time_max` is exclusive; to cover a full day, set `time_max` to 00:00:00 of the following day in the target timezone rather than 23:59:59.",
          "human_parameter_name": "End Time",
          "human_parameter_description": "When to stop looking for availability. Leave this blank to use the end of the day (23:59:59) from your start time, or the current day if no start time is provided."
        },
        "time_min": {
          "type": "string",
          "title": "Time Min",
          "examples": [
            "2024-12-06T13:00:00Z",
            "2024,12,06,13,00,00",
            "2024-12-06 13:00:00"
          ],
          "description": "Start datetime for the query interval. Accepts ISO, comma-separated, or simple datetime formats. If provided without an explicit timezone, it is interpreted in the specified `timezone`. If not provided, defaults to the current timestamp in the specified `timezone` to ensure only future/bookable slots are returned. Maximum span between time_min and time_max is approximately 90 days per Google Calendar freeBusy API limit.",
          "human_parameter_name": "Start Time",
          "human_parameter_description": "When to start looking for availability. Leave this blank to use the current time in your selected timezone."
        },
        "timezone": {
          "type": "string",
          "title": "Timezone",
          "default": "UTC",
          "examples": [
            "UTC",
            "America/New_York",
            "Europe/Berlin"
          ],
          "description": "IANA timezone identifier (e.g., 'America/New_York', 'Europe/London', 'Asia/Tokyo'). Determines how naive `time_min`/`time_max` are interpreted and the timezone used in the response for `timeMin`, `timeMax`, busy periods, and calculated free slots. Note: 'local' is not supported; use a specific IANA timezone name.",
          "human_parameter_name": "Timezone",
          "human_parameter_description": "The time zone to interpret your dates and show results. Choose where you are (e.g., America/New_York or Europe/London) so times make sense to you."
        },
        "group_expansion_max": {
          "type": "integer",
          "title": "Group Expansion Max",
          "default": 100,
          "maximum": 100,
          "minimum": 1,
          "description": "Maximum calendar identifiers to return for a single group. Must be between 1 and 100 (inclusive). Values exceeding 100 will be rejected.",
          "human_parameter_name": "Max Groups",
          "human_parameter_description": "The maximum number of calendars to expand when you provide a group address. Most users can keep the default."
        },
        "calendar_expansion_max": {
          "type": "integer",
          "title": "Calendar Expansion Max",
          "default": 50,
          "maximum": 50,
          "minimum": 1,
          "description": "Maximum calendars for which FreeBusy information is provided. Must be between 1 and 50 (inclusive). Values exceeding 50 will be rejected.",
          "human_parameter_name": "Max Calendars",
          "human_parameter_description": "The maximum number of calendars to include in the free/busy check. Increase only if you're checking many calendars at once."
        }
      }
    },
    "errorBody": null
  },
  {
    "slug": "GOOGLECALENDAR_CREATE_EVENT",
    "status": 200,
    "version": "20260721_00",
    "description": "Create a Google Calendar event using start_datetime plus duration fields. The organizer is added as an attendee unless exclude_organizer is True. By default adds Google Meet link (works for Workspace, gracefully falls back for personal Gmail). Attendees can be email strings (required) or objects with email and optional fields. No conflict checking is performed; use GOOGLECALENDAR_FREE_BUSY_QUERY to detect overlaps before creating. Returns event id and htmlLink nested under data.response_data. Example: { \"start_datetime\": \"2025-01-16T13:00:00\", \"timezone\": \"America/New_York\", \"event_duration_hour\": 1, \"event_duration_minutes\": 30, \"summary\": \"Client sync\", \"attendees\": [\"required@example.com\", {\"email\": \"optional@example.com\", \"optional\": true}] }",
    "inputParameters": {
      "type": "object",
      "title": "CreateEventRequest",
      "required": [
        "start_datetime"
      ],
      "properties": {
        "summary": {
          "type": "string",
          "title": "Summary",
          "description": "Summary (title) of the event."
        },
        "location": {
          "type": "string",
          "title": "Location",
          "description": "Geographic location of the event as free-form text."
        },
        "timezone": {
          "type": "string",
          "title": "Timezone",
          "description": "IANA timezone name from the timezone database (e.g., 'America/New_York', 'Europe/London', 'Asia/Jerusalem', 'UTC'). Required if datetime is naive. For recurring events, start and end must include a timeZone. If not provided, UTC is used. If datetime includes timezone info (Z or offset), this field is optional and defaults to UTC. IMPORTANT: Must be a valid IANA timezone identifier. Values like 'EST', 'PST', 'ISRAEL TIME', or other abbreviations are NOT valid IANA timezone names."
        },
        "attendees": {
          "type": "array",
          "items": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "object",
                "additionalProperties": true
              }
            ]
          },
          "title": "Attendees",
          "description": "List of attendees. Each attendee can be either: (1) A string email address (e.g., 'user@example.com'), or (2) An object with 'email' (required), 'optional' (boolean, default false), 'displayName' (string), 'comment' (string), 'additionalGuests' (integer), and 'resource' (boolean). To mark an attendee as optional (not required), use object format: {'email': 'user@example.com', 'optional': true}. IMPORTANT: Only valid email addresses are accepted. Plain names cannot be used."
        },
        "eventType": {
          "enum": [
            "birthday",
            "default",
            "focusTime",
            "outOfOffice",
            "workingLocation"
          ],
          "type": "string",
          "title": "Event Type",
          "default": "default",
          "description": "Type of the event, immutable post-creation. 'workingLocation' (REQUIRES Google Workspace Enterprise). Note: 'fromGmail' events cannot be created via API.",
          "human_parameter_name": "Event Type"
        },
        "recurrence": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "title": "Recurrence",
          "description": "List of RRULE, EXRULE, RDATE, EXDATE lines for recurring events. Supported frequencies: DAILY, WEEKLY, MONTHLY, YEARLY. For recurring events, start.timeZone and end.timeZone must be present. UNTIL values follow RFC 5545: date-only (YYYYMMDD) for all-day events, or UTC datetime with Z suffix (YYYYMMDDTHHMMSSZ) for timed events. UNTIL values with time but missing Z suffix are auto-corrected. Provide an empty list to remove recurrence so the event becomes non-recurring."
        },
        "visibility": {
          "enum": [
            "default",
            "public",
            "private",
            "confidential"
          ],
          "type": "string",
          "title": "Visibility",
          "default": "default",
          "description": "Event visibility: 'default', 'public', 'private', or 'confidential'."
        },
        "calendar_id": {
          "type": "string",
          "title": "Calendar Id",
          "default": "primary",
          "examples": [
            "primary",
            "abcdefghijklmnopqrstuvwxyz@group.calendar.google.com"
          ],
          "description": "Calendar identifier. Use 'primary' (recommended) for the user's main calendar. Alternatively, use a calendar ID from the user's accessible calendar list. Calendar IDs look like email addresses (e.g., 'xyz@group.calendar.google.com' for shared calendars). Important: Arbitrary email addresses will NOT work - the calendar must exist in the user's calendar list with appropriate access permissions. Use GOOGLECALENDAR_LIST_CALENDARS to retrieve valid calendar IDs.",
          "human_parameter_name": "Calendar ID",
          "human_parameter_description": "The calendar where you want to create the event. Use 'primary' (recommended) for your main calendar. For other calendars, use a calendar ID from your accessible calendar list - not an arbitrary email address."
        },
        "description": {
          "type": "string",
          "title": "Description",
          "description": "Description of the event. Can contain HTML. Optional. Must be omitted for 'birthday' event type."
        },
        "end_datetime": {
          "type": "string",
          "title": "End Datetime",
          "pattern": "^\\d{4}-\\d{2}-\\d{2}[T ]\\d{2}:\\d{2}(:\\d{2})?(\\.\\d+)?(Z|[+-]\\d{1,2}(:?\\d{2})?)?$",
          "description": "Event end time in ISO 8601 format: YYYY-MM-DDTHH:MM:SS. When provided, this parameter takes precedence over event_duration_hour and event_duration_minutes. If not provided, the end time is calculated using start_datetime + duration. Must be after start_datetime. Fractional seconds and timezone info will be automatically stripped if provided. Examples: '2025-01-16T14:30:00', '2025-01-16T14:30'."
        },
        "send_updates": {
          "enum": [
            "all",
            "externalOnly",
            "none"
          ],
          "type": "string",
          "title": "SendUpdates",
          "description": "Options for who should receive notifications about event changes.",
          "human_parameter_name": "Send updates?"
        },
        "transparency": {
          "enum": [
            "opaque",
            "transparent"
          ],
          "type": "string",
          "title": "Transparency",
          "default": "opaque",
          "description": "'opaque' (busy) or 'transparent' (available)."
        },
        "start_datetime": {
          "type": "string",
          "title": "Start Datetime",
          "pattern": "^\\d{4}-\\d{2}-\\d{2}[T ]\\d{2}:\\d{2}(:\\d{2})?(\\.\\d+)?(Z|[+-]\\d{1,2}(:?\\d{2})?)?$",
          "description": "REQUIRED. Event start time in ISO 8601 format: YYYY-MM-DDTHH:MM:SS. IMPORTANT: Natural language expressions like 'tomorrow', 'next Monday', '2pm tomorrow' are NOT supported and will be rejected. You must provide the exact date and time in ISO format. Fractional seconds (e.g., .000) and timezone info (Z, +, -) will be automatically stripped if provided. Examples: '2025-01-16T13:00:00', '2025-01-16T13:00'."
        },
        "guestsCanModify": {
          "type": "boolean",
          "title": "Guests Can Modify",
          "description": "If True, guests can modify the event."
        },
        "exclude_organizer": {
          "type": "boolean",
          "title": "Exclude Organizer",
          "default": false,
          "description": "If True, the organizer will NOT be added as an attendee. Default is False (organizer is included).",
          "human_parameter_name": "Exclude Organizer",
          "human_parameter_description": "Choose whether to include yourself (the organizer) as an attendee. Turn this on if you don't want to appear as a guest or receive attendee notifications."
        },
        "birthdayProperties": {
          "type": "object",
          "title": "BirthdayProperties",
          "properties": {
            "type": {
              "enum": [
                "birthday",
                "anniversary",
                "other"
              ],
              "type": "string",
              "title": "Type",
              "default": "birthday",
              "description": "Type of birthday event: 'birthday', 'anniversary', or 'other'. Defaults to 'birthday'.",
              "human_parameter_name": "Birthday Type"
            },
            "contact": {
              "type": "string",
              "title": "Contact",
              "description": "Contact ID in format 'people/c12345' from Google People API. REQUIRED when type is 'anniversary' or 'other'. MUST BE OMITTED when type is 'birthday' (the API forbids contact field for type='birthday').",
              "human_parameter_name": "Contact"
            },
            "customTypeName": {
              "type": "string",
              "title": "Custom Type Name",
              "description": "Custom type name when type is 'other'. Requires valid contact field.",
              "human_parameter_name": "Custom Type Name"
            }
          },
          "description": "Properties for birthday events.",
          "additionalProperties": false,
          "human_parameter_name": "Birthday Properties"
        },
        "create_meeting_room": {
          "type": "boolean",
          "title": "Create Meeting Room",
          "default": true,
          "description": "Defaults to True. When True, for CREATE operations creates a Google Meet link; for UPDATE operations preserves existing conference data if present, or adds a new Meet link if none exists. Google Workspace accounts will successfully receive a Meet link. Personal Gmail accounts and other unsupported accounts will gracefully fallback to creating an event without a Meet link when conference creation fails. Set to False to skip Meet link operations (won't create new or modify existing conference data). The fallback ensures event creation succeeds even when conference features are unavailable due to account limitations.",
          "human_parameter_name": "Create Meeting Room?"
        },
        "event_duration_hour": {
          "type": "integer",
          "title": "Event Duration Hour",
          "default": 0,
          "minimum": 0,
          "description": "Number of hours for the event duration. Supports multi-day events (e.g., 240 hours = 10 days). For durations under 1 hour, use event_duration_minutes instead. Ignored if end_datetime is provided."
        },
        "extended_properties": {
          "type": "object",
          "title": "Extended Properties",
          "description": "Extended properties of the event for storing custom metadata. Contains 'private' (visible only on this calendar) and/or 'shared' (visible to all attendees) dictionaries mapping string keys to string values. Example: {'private': {'key1': 'value1'}, 'shared': {'key2': 'value2'}}",
          "additionalProperties": {
            "type": "object",
            "additionalProperties": {
              "type": "string"
            }
          },
          "human_parameter_name": "Extended Properties"
        },
        "focusTimeProperties": {
          "type": "object",
          "title": "FocusTimeProperties",
          "properties": {
            "chatStatus": {
              "enum": [
                "active",
                "doNotDisturb"
              ],
              "type": "string",
              "title": "ChatStatus",
              "description": "Chat status during focus time: 'active' or 'doNotDisturb'.",
              "human_parameter_name": "Chat Status"
            },
            "declineMessage": {
              "type": "string",
              "title": "Decline Message",
              "description": "Message to include in declined meeting invitations. Only used when autoDeclineMode is set.",
              "human_parameter_name": "Decline Message"
            },
            "autoDeclineMode": {
              "enum": [
                "declineNone",
                "declineAllConflictingInvitations",
                "declineOnlyNewConflictingInvitations"
              ],
              "type": "string",
              "title": "AutoDeclineMode",
              "description": "Auto decline mode: 'declineNone' (no invitations declined), 'declineAllConflictingInvitations' (all conflicting invitations declined), or 'declineOnlyNewConflictingInvitations' (only new conflicting invitations declined).",
              "human_parameter_name": "Auto Decline Mode"
            }
          },
          "description": "Properties for focusTime events. REQUIRES Google Workspace Enterprise account with Focus Time feature enabled.",
          "additionalProperties": false,
          "human_parameter_name": "Focus Time Properties"
        },
        "guestsCanInviteOthers": {
          "type": "boolean",
          "title": "Guests Can Invite Others",
          "description": "Whether attendees other than the organizer can invite others to the event.",
          "human_parameter_name": "Can guests invite others?"
        },
        "outOfOfficeProperties": {
          "type": "object",
          "title": "OutOfOfficeProperties",
          "properties": {
            "declineMessage": {
              "type": "string",
              "title": "Decline Message",
              "description": "Message to include in declined meeting invitations. Only used when autoDeclineMode is set.",
              "human_parameter_name": "Decline Message"
            },
            "autoDeclineMode": {
              "enum": [
                "declineNone",
                "declineAllConflictingInvitations",
                "declineOnlyNewConflictingInvitations"
              ],
              "type": "string",
              "title": "AutoDeclineMode",
              "description": "Auto decline mode: 'declineNone' (no invitations declined), 'declineAllConflictingInvitations' (all conflicting invitations declined), or 'declineOnlyNewConflictingInvitations' (only new conflicting invitations declined). RECURRING EVENT RESTRICTION: For recurring out-of-office events, ONLY 'declineOnlyNewConflictingInvitations' is allowed. Cannot use 'declineAllConflictingInvitations' for recurring OOO (Google Calendar prevents retroactively declining existing meetings). REQUIRES Google Workspace (paid business subscription, e.g., Business Starter at $6/user/month). Personal Gmail accounts cannot use this feature.",
              "human_parameter_name": "Auto Decline Mode"
            }
          },
          "description": "Properties for outOfOffice events.",
          "additionalProperties": false,
          "human_parameter_name": "Out of Office Properties"
        },
        "event_duration_minutes": {
          "type": "integer",
          "title": "Event Duration Minutes",
          "default": 30,
          "maximum": 59,
          "minimum": 0,
          "description": "Duration in minutes (0-59 ONLY). NEVER use 60+ minutes - use event_duration_hour=1 instead. Maximum value is 59. Combined duration (hours + minutes) must be greater than 0. Ignored if end_datetime is provided."
        },
        "guestsCanSeeOtherGuests": {
          "type": "boolean",
          "title": "Guests Can See Other Guests",
          "description": "Whether attendees other than the organizer can see who the event's attendees are.",
          "human_parameter_name": "Can guests see others?"
        },
        "workingLocationProperties": {
          "type": "object",
          "title": "WorkingLocationProperties",
          "required": [
            "type"
          ],
          "properties": {
            "type": {
              "enum": [
                "homeOffice",
                "officeLocation",
                "customLocation"
              ],
              "type": "string",
              "title": "Type",
              "description": "Type of working location ('homeOffice' | 'officeLocation' | 'customLocation')."
            },
            "homeOffice": {
              "type": "object",
              "title": "WorkingLocationHomeOffice",
              "properties": {},
              "description": "Empty object marker for home office working location.\n\nThis is used to indicate the user is working from home.\nGoogle Calendar API accepts an empty object for this field.",
              "additionalProperties": false
            },
            "customLocation": {
              "type": "object",
              "title": "WorkingLocationCustom",
              "required": [
                "label"
              ],
              "properties": {
                "label": {
                  "type": "string",
                  "title": "Label",
                  "description": "Label for a custom working location (e.g., 'Client site')."
                }
              },
              "description": "Custom working location with a display label.",
              "additionalProperties": false
            },
            "officeLocation": {
              "type": "object",
              "title": "WorkingLocationOffice",
              "properties": {
                "label": {
                  "type": "string",
                  "title": "Label",
                  "description": "Office name displayed in Calendar clients (e.g., building name)."
                },
                "deskId": {
                  "type": "string",
                  "title": "Desk Id",
                  "description": "Optional desk identifier."
                },
                "floorId": {
                  "type": "string",
                  "title": "Floor Id",
                  "description": "Optional floor identifier."
                },
                "buildingId": {
                  "type": "string",
                  "title": "Building Id",
                  "description": "Optional building identifier from org Resources."
                },
                "floorSectionId": {
                  "type": "string",
                  "title": "Floor Section Id",
                  "description": "Optional floor section identifier."
                }
              },
              "description": "Office-based working location details.",
              "additionalProperties": false
            }
          },
          "description": "Properties for workingLocation events. REQUIRES Google Workspace Enterprise.\n\nConstraints discovered from testing:\n- Must set transparency='transparent' and visibility='public'\n- Description must be omitted\n- Depending on 'type', include one of 'homeOffice', 'officeLocation', or 'customLocation'",
          "additionalProperties": false,
          "human_parameter_name": "Working Location"
        }
      }
    },
    "errorBody": null
  },
  {
    "slug": "GOOGLECALENDAR_UPDATE_EVENT",
    "status": 200,
    "version": "20260721_00",
    "description": "Updates an existing event in Google Calendar. REQUIRES event_id - you MUST first search for the event using GOOGLECALENDAR_FIND_EVENT or GOOGLECALENDAR_EVENTS_LIST to obtain the event_id. This is a full PUT replacement: omitted fields (including attendees, reminders, recurrence, conferencing) are cleared. Always provide the complete desired event state. Use GOOGLECALENDAR_PATCH_EVENT instead for partial edits.",
    "inputParameters": {
      "type": "object",
      "title": "UpdateEventRequest",
      "required": [
        "start_datetime",
        "event_id"
      ],
      "properties": {
        "summary": {
          "type": "string",
          "title": "Summary",
          "description": "Summary (title) of the event."
        },
        "event_id": {
          "type": "string",
          "title": "Event Id",
          "examples": [
            "a1b2c3d4e5f6g7h8i9j0k1l2m3"
          ],
          "description": "REQUIRED. The unique identifier of the event to update. This parameter is MANDATORY - events cannot be updated by title, date, or other criteria. You MUST first retrieve the event_id by using GOOGLECALENDAR_FIND_EVENT or GOOGLECALENDAR_EVENTS_LIST to search for the event, then use the returned 'id' field here.",
          "human_parameter_name": "Event ID",
          "human_parameter_description": "REQUIRED. The unique ID of the event you want to update. You MUST obtain this ID first by searching/listing events (use GOOGLECALENDAR_FIND_EVENT or GOOGLECALENDAR_EVENTS_LIST), then copy the 'id' field from the event you want to update."
        },
        "location": {
          "type": "string",
          "title": "Location",
          "description": "Geographic location of the event as free-form text."
        },
        "timezone": {
          "type": "string",
          "title": "Timezone",
          "description": "IANA timezone name from the timezone database (e.g., 'America/New_York', 'Europe/London', 'Asia/Jerusalem', 'UTC'). Required if datetime is naive. For recurring events, start and end must include a timeZone. If not provided, UTC is used. If datetime includes timezone info (Z or offset), this field is optional and defaults to UTC. IMPORTANT: Must be a valid IANA timezone identifier. Values like 'EST', 'PST', 'ISRAEL TIME', or other abbreviations are NOT valid IANA timezone names."
        },
        "attendees": {
          "type": "array",
          "items": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "object",
                "additionalProperties": true
              }
            ]
          },
          "title": "Attendees",
          "description": "List of attendees. Each attendee can be either: (1) A string email address (e.g., 'user@example.com'), or (2) An object with 'email' (required), 'optional' (boolean, default false), 'displayName' (string), 'comment' (string), 'additionalGuests' (integer), and 'resource' (boolean). To mark an attendee as optional (not required), use object format: {'email': 'user@example.com', 'optional': true}. IMPORTANT: Only valid email addresses are accepted. Plain names cannot be used."
        },
        "eventType": {
          "enum": [
            "birthday",
            "default",
            "focusTime",
            "outOfOffice",
            "workingLocation"
          ],
          "type": "string",
          "title": "Event Type",
          "default": "default",
          "description": "Type of the event, immutable post-creation. 'workingLocation' (REQUIRES Google Workspace Enterprise). Note: 'fromGmail' events cannot be created via API.",
          "human_parameter_name": "Event Type"
        },
        "recurrence": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "title": "Recurrence",
          "description": "List of RRULE, EXRULE, RDATE, EXDATE lines for recurring events. Supported frequencies: DAILY, WEEKLY, MONTHLY, YEARLY. For recurring events, start.timeZone and end.timeZone must be present. UNTIL values follow RFC 5545: date-only (YYYYMMDD) for all-day events, or UTC datetime with Z suffix (YYYYMMDDTHHMMSSZ) for timed events. UNTIL values with time but missing Z suffix are auto-corrected. Provide an empty list to remove recurrence so the event becomes non-recurring."
        },
        "visibility": {
          "enum": [
            "default",
            "public",
            "private",
            "confidential"
          ],
          "type": "string",
          "title": "Visibility",
          "default": "default",
          "description": "Event visibility: 'default', 'public', 'private', or 'confidential'."
        },
        "calendar_id": {
          "type": "string",
          "title": "Calendar Id",
          "default": "primary",
          "examples": [
            "primary",
            "user@example.com",
            "long_calendar_id@group.calendar.google.com"
          ],
          "description": "Identifier of the Google Calendar where the event resides. The value 'primary' targets the user's primary calendar.",
          "human_parameter_name": "Calendar ID",
          "human_parameter_description": "The calendar where the event lives. Use 'primary' for your main calendar, or enter an email address or calendar ID to target a different calendar."
        },
        "description": {
          "type": "string",
          "title": "Description",
          "description": "Description of the event. Can contain HTML. Optional. Must be omitted for 'birthday' event type."
        },
        "end_datetime": {
          "type": "string",
          "title": "End Datetime",
          "pattern": "^\\d{4}-\\d{2}-\\d{2}[T ]\\d{2}:\\d{2}(:\\d{2})?(\\.\\d+)?(Z|[+-]\\d{1,2}(:?\\d{2})?)?$",
          "description": "Event end time in ISO 8601 format: YYYY-MM-DDTHH:MM:SS. When provided, this parameter takes precedence over event_duration_hour and event_duration_minutes. If not provided, the end time is calculated using start_datetime + duration. Must be after start_datetime. Fractional seconds and timezone info will be automatically stripped if provided. Examples: '2025-01-16T14:30:00', '2025-01-16T14:30'."
        },
        "send_updates": {
          "enum": [
            "all",
            "externalOnly",
            "none"
          ],
          "type": "string",
          "title": "SendUpdates",
          "description": "Options for who should receive notifications about event changes.",
          "human_parameter_name": "Send updates?"
        },
        "transparency": {
          "enum": [
            "opaque",
            "transparent"
          ],
          "type": "string",
          "title": "Transparency",
          "default": "opaque",
          "description": "'opaque' (busy) or 'transparent' (available)."
        },
        "start_datetime": {
          "type": "string",
          "title": "Start Datetime",
          "pattern": "^\\d{4}-\\d{2}-\\d{2}[T ]\\d{2}:\\d{2}(:\\d{2})?(\\.\\d+)?(Z|[+-]\\d{1,2}(:?\\d{2})?)?$",
          "description": "REQUIRED. Event start time in ISO 8601 format: YYYY-MM-DDTHH:MM:SS. IMPORTANT: Natural language expressions like 'tomorrow', 'next Monday', '2pm tomorrow' are NOT supported and will be rejected. You must provide the exact date and time in ISO format. Fractional seconds (e.g., .000) and timezone info (Z, +, -) will be automatically stripped if provided. Examples: '2025-01-16T13:00:00', '2025-01-16T13:00'."
        },
        "guestsCanModify": {
          "type": "boolean",
          "title": "Guests Can Modify",
          "description": "If True, guests can modify the event."
        },
        "birthdayProperties": {
          "type": "object",
          "title": "BirthdayProperties",
          "properties": {
            "type": {
              "enum": [
                "birthday",
                "anniversary",
                "other"
              ],
              "type": "string",
              "title": "Type",
              "default": "birthday",
              "description": "Type of birthday event: 'birthday', 'anniversary', or 'other'. Defaults to 'birthday'.",
              "human_parameter_name": "Birthday Type"
            },
            "contact": {
              "type": "string",
              "title": "Contact",
              "description": "Contact ID in format 'people/c12345' from Google People API. REQUIRED when type is 'anniversary' or 'other'. MUST BE OMITTED when type is 'birthday' (the API forbids contact field for type='birthday').",
              "human_parameter_name": "Contact"
            },
            "customTypeName": {
              "type": "string",
              "title": "Custom Type Name",
              "description": "Custom type name when type is 'other'. Requires valid contact field.",
              "human_parameter_name": "Custom Type Name"
            }
          },
          "description": "Properties for birthday events.",
          "additionalProperties": false,
          "human_parameter_name": "Birthday Properties"
        },
        "create_meeting_room": {
          "type": "boolean",
          "title": "Create Meeting Room",
          "default": true,
          "description": "Defaults to True. When True, for CREATE operations creates a Google Meet link; for UPDATE operations preserves existing conference data if present, or adds a new Meet link if none exists. Google Workspace accounts will successfully receive a Meet link. Personal Gmail accounts and other unsupported accounts will gracefully fallback to creating an event without a Meet link when conference creation fails. Set to False to skip Meet link operations (won't create new or modify existing conference data). The fallback ensures event creation succeeds even when conference features are unavailable due to account limitations.",
          "human_parameter_name": "Create Meeting Room?"
        },
        "event_duration_hour": {
          "type": "integer",
          "title": "Event Duration Hour",
          "default": 0,
          "minimum": 0,
          "description": "Number of hours for the event duration. Supports multi-day events (e.g., 240 hours = 10 days). For durations under 1 hour, use event_duration_minutes instead. Ignored if end_datetime is provided."
        },
        "extended_properties": {
          "type": "object",
          "title": "Extended Properties",
          "description": "Extended properties of the event for storing custom metadata. Contains 'private' (visible only on this calendar) and/or 'shared' (visible to all attendees) dictionaries mapping string keys to string values. Example: {'private': {'key1': 'value1'}, 'shared': {'key2': 'value2'}}",
          "additionalProperties": {
            "type": "object",
            "additionalProperties": {
              "type": "string"
            }
          },
          "human_parameter_name": "Extended Properties"
        },
        "focusTimeProperties": {
          "type": "object",
          "title": "FocusTimeProperties",
          "properties": {
            "chatStatus": {
              "enum": [
                "active",
                "doNotDisturb"
              ],
              "type": "string",
              "title": "ChatStatus",
              "description": "Chat status during focus time: 'active' or 'doNotDisturb'.",
              "human_parameter_name": "Chat Status"
            },
            "declineMessage": {
              "type": "string",
              "title": "Decline Message",
              "description": "Message to include in declined meeting invitations. Only used when autoDeclineMode is set.",
              "human_parameter_name": "Decline Message"
            },
            "autoDeclineMode": {
              "enum": [
                "declineNone",
                "declineAllConflictingInvitations",
                "declineOnlyNewConflictingInvitations"
              ],
              "type": "string",
              "title": "AutoDeclineMode",
              "description": "Auto decline mode: 'declineNone' (no invitations declined), 'declineAllConflictingInvitations' (all conflicting invitations declined), or 'declineOnlyNewConflictingInvitations' (only new conflicting invitations declined).",
              "human_parameter_name": "Auto Decline Mode"
            }
          },
          "description": "Properties for focusTime events. REQUIRES Google Workspace Enterprise account with Focus Time feature enabled.",
          "additionalProperties": false,
          "human_parameter_name": "Focus Time Properties"
        },
        "guestsCanInviteOthers": {
          "type": "boolean",
          "title": "Guests Can Invite Others",
          "description": "Whether attendees other than the organizer can invite others to the event.",
          "human_parameter_name": "Can guests invite others?"
        },
        "outOfOfficeProperties": {
          "type": "object",
          "title": "OutOfOfficeProperties",
          "properties": {
            "declineMessage": {
              "type": "string",
              "title": "Decline Message",
              "description": "Message to include in declined meeting invitations. Only used when autoDeclineMode is set.",
              "human_parameter_name": "Decline Message"
            },
            "autoDeclineMode": {
              "enum": [
                "declineNone",
                "declineAllConflictingInvitations",
                "declineOnlyNewConflictingInvitations"
              ],
              "type": "string",
              "title": "AutoDeclineMode",
              "description": "Auto decline mode: 'declineNone' (no invitations declined), 'declineAllConflictingInvitations' (all conflicting invitations declined), or 'declineOnlyNewConflictingInvitations' (only new conflicting invitations declined). RECURRING EVENT RESTRICTION: For recurring out-of-office events, ONLY 'declineOnlyNewConflictingInvitations' is allowed. Cannot use 'declineAllConflictingInvitations' for recurring OOO (Google Calendar prevents retroactively declining existing meetings). REQUIRES Google Workspace (paid business subscription, e.g., Business Starter at $6/user/month). Personal Gmail accounts cannot use this feature.",
              "human_parameter_name": "Auto Decline Mode"
            }
          },
          "description": "Properties for outOfOffice events.",
          "additionalProperties": false,
          "human_parameter_name": "Out of Office Properties"
        },
        "event_duration_minutes": {
          "type": "integer",
          "title": "Event Duration Minutes",
          "default": 30,
          "maximum": 59,
          "minimum": 0,
          "description": "Duration in minutes (0-59 ONLY). NEVER use 60+ minutes - use event_duration_hour=1 instead. Maximum value is 59. Combined duration (hours + minutes) must be greater than 0. Ignored if end_datetime is provided."
        },
        "guestsCanSeeOtherGuests": {
          "type": "boolean",
          "title": "Guests Can See Other Guests",
          "description": "Whether attendees other than the organizer can see who the event's attendees are.",
          "human_parameter_name": "Can guests see others?"
        },
        "workingLocationProperties": {
          "type": "object",
          "title": "WorkingLocationProperties",
          "required": [
            "type"
          ],
          "properties": {
            "type": {
              "enum": [
                "homeOffice",
                "officeLocation",
                "customLocation"
              ],
              "type": "string",
              "title": "Type",
              "description": "Type of working location ('homeOffice' | 'officeLocation' | 'customLocation')."
            },
            "homeOffice": {
              "type": "object",
              "title": "WorkingLocationHomeOffice",
              "properties": {},
              "description": "Empty object marker for home office working location.\n\nThis is used to indicate the user is working from home.\nGoogle Calendar API accepts an empty object for this field.",
              "additionalProperties": false
            },
            "customLocation": {
              "type": "object",
              "title": "WorkingLocationCustom",
              "required": [
                "label"
              ],
              "properties": {
                "label": {
                  "type": "string",
                  "title": "Label",
                  "description": "Label for a custom working location (e.g., 'Client site')."
                }
              },
              "description": "Custom working location with a display label.",
              "additionalProperties": false
            },
            "officeLocation": {
              "type": "object",
              "title": "WorkingLocationOffice",
              "properties": {
                "label": {
                  "type": "string",
                  "title": "Label",
                  "description": "Office name displayed in Calendar clients (e.g., building name)."
                },
                "deskId": {
                  "type": "string",
                  "title": "Desk Id",
                  "description": "Optional desk identifier."
                },
                "floorId": {
                  "type": "string",
                  "title": "Floor Id",
                  "description": "Optional floor identifier."
                },
                "buildingId": {
                  "type": "string",
                  "title": "Building Id",
                  "description": "Optional building identifier from org Resources."
                },
                "floorSectionId": {
                  "type": "string",
                  "title": "Floor Section Id",
                  "description": "Optional floor section identifier."
                }
              },
              "description": "Office-based working location details.",
              "additionalProperties": false
            }
          },
          "description": "Properties for workingLocation events. REQUIRES Google Workspace Enterprise.\n\nConstraints discovered from testing:\n- Must set transparency='transparent' and visibility='public'\n- Description must be omitted\n- Depending on 'type', include one of 'homeOffice', 'officeLocation', or 'customLocation'",
          "additionalProperties": false,
          "human_parameter_name": "Working Location"
        }
      }
    },
    "errorBody": null
  },
  {
    "slug": "HUBSPOT_FETCH_CONTACT_DETAILS_BY_ID",
    "status": 404,
    "version": null,
    "description": null,
    "inputParameters": null,
    "errorBody": {
      "error": {
        "message": "Tool HUBSPOT_FETCH_CONTACT_DETAILS_BY_ID not found",
        "code": 2401,
        "slug": "Tool_ToolNotFound",
        "status": 404,
        "request_id": "671b1a3e-a903-4aff-a55d-658b6d88d5c1",
        "suggested_fix": "Check your input."
      }
    }
  },
  {
    "slug": "HUBSPOT_READ_A_PAGE_OF_DEALS",
    "status": 404,
    "version": null,
    "description": null,
    "inputParameters": null,
    "errorBody": {
      "error": {
        "message": "Tool HUBSPOT_READ_A_PAGE_OF_DEALS not found",
        "code": 2401,
        "slug": "Tool_ToolNotFound",
        "status": 404,
        "request_id": "2ba6cc8c-3685-43ff-8cf4-291a6cb8aca1",
        "suggested_fix": "Check your input."
      }
    }
  },
  {
    "slug": "WHATSAPP_SEND_MESSAGE",
    "status": 200,
    "version": "20260721_00",
    "description": "Send a text message to a WhatsApp user. Important: The recipient phone number must be registered on WhatsApp and must have initiated a conversation with your business within the last 24 hours, OR you must use a template message (see WHATSAPP_SEND_TEMPLATE_MESSAGE) for the first message outside the 24-hour window. For test accounts, recipient numbers must be added to the test recipient list in Meta Business Suite before sending messages.",
    "inputParameters": {
      "type": "object",
      "title": "SendMessageRequest",
      "required": [
        "phone_number_id",
        "to_number",
        "text"
      ],
      "properties": {
        "text": {
          "type": "string",
          "title": "Text",
          "description": "The text content of the message to send. Supports Unicode characters including emojis. Maximum length: 4096 characters."
        },
        "to_number": {
          "type": "string",
          "title": "To Number",
          "description": "The recipient's WhatsApp phone number in international format without the + sign (e.g., '14155551234' for a US number). The number must be registered on WhatsApp."
        },
        "message_id": {
          "type": "string",
          "title": "Message Id",
          "description": "Optional: The WhatsApp message ID (wamid) to reply to. When provided, this message will be sent as a reply to the specified message, creating a quoted reply thread. Leave empty to send a regular message."
        },
        "preview_url": {
          "type": "boolean",
          "title": "Preview Url",
          "default": false,
          "description": "Set to True to show a preview card for URLs in the message. When enabled, WhatsApp will fetch and display URL metadata (title, description, image) for the first URL in the message. Default: False."
        },
        "phone_number_id": {
          "type": "string",
          "title": "Phone Number Id",
          "description": "The Meta-assigned numeric ID for the WhatsApp Business phone number to send from. This is NOT the actual phone number itself - it is a numeric ID (e.g., '712594308615206') assigned by Meta. Obtain it using WHATSAPP_GET_PHONE_NUMBERS action which returns the 'id' field for each phone number."
        }
      },
      "description": "Request schema for sending a text message via WhatsApp."
    },
    "errorBody": null
  },
  {
    "slug": "SLACK_FETCH_CONVERSATION_HISTORY",
    "status": 200,
    "version": "20260721_00",
    "description": "Fetches a chronological list of messages and events from a specified Slack conversation, accessible by the authenticated user/bot, with options for pagination and time range filtering. IMPORTANT LIMITATION: This action only returns messages from the main channel timeline. Threaded replies are NOT returned by this endpoint. To retrieve threaded replies, use the SLACK_FETCH_MESSAGE_THREAD_FROM_A_CONVERSATION action (conversations.replies API) instead. The oldest/latest timestamp filters work reliably for filtering the main channel timeline, but cannot be used to retrieve individual threaded replies - even if you know the exact reply timestamp, setting oldest=latest to that timestamp will return an empty messages array. To get threaded replies: 1. Use this action to get parent messages (which include thread_ts, reply_count, latest_reply fields) 2. Use SLACK_FETCH_MESSAGE_THREAD_FROM_A_CONVERSATION with the parent's thread_ts to fetch all replies in that thread",
    "inputParameters": {
      "type": "object",
      "title": "FetchConversationHistoryRequest",
      "required": [
        "channel"
      ],
      "properties": {
        "limit": {
          "type": "integer",
          "title": "Limit",
          "default": 100,
          "maximum": 1000,
          "minimum": 1,
          "examples": [
            "100",
            "200"
          ],
          "description": "Maximum number of messages to request in this single Slack API call (1-1000). Defaults to 100. Slack may return fewer than requested, especially for non-Marketplace apps where Slack can cap each page at 15 messages. This action does not internally paginate; use response_metadata.next_cursor in the cursor parameter of a follow-up call to fetch more messages.",
          "human_parameter_name": "Message Limit",
          "human_parameter_description": "Set how many messages to request in this page, up to 1000. Use the returned next cursor in another call to continue."
        },
        "cursor": {
          "type": "string",
          "title": "Cursor",
          "examples": [
            "dXNlcjpVMDYxTkZUVDA="
          ],
          "description": "Pagination cursor from `response_metadata.next_cursor` of a previous response. Omit this for the first page; pass the returned cursor in a follow-up call to fetch the next page.",
          "human_parameter_name": "Pagination Cursor",
          "human_parameter_description": "Use the cursor from a previous response to continue retrieving messages from where you left off."
        },
        "latest": {
          "type": "string",
          "title": "Latest",
          "examples": [
            "1609459200.000000"
          ],
          "description": "End of the time range of messages to include in results. Accepts a Unix timestamp or a Slack timestamp (e.g., '1234567890.000000'). NOTE: This filter only applies to main channel messages, not threaded replies. Use SLACK_FETCH_MESSAGE_THREAD_FROM_A_CONVERSATION to retrieve replies.",
          "human_parameter_name": "Latest Timestamp",
          "human_parameter_description": "Provide the latest timestamp of messages you want to include, to filter results up to this point. Only filters main channel messages, not threaded replies."
        },
        "oldest": {
          "type": "string",
          "title": "Oldest",
          "examples": [
            "1609372800.000000"
          ],
          "description": "Start of the time range of messages to include in results. Accepts a Unix timestamp or a Slack timestamp (e.g., '1234567890.000000'). NOTE: This filter only applies to main channel messages, not threaded replies. Use SLACK_FETCH_MESSAGE_THREAD_FROM_A_CONVERSATION to retrieve replies.",
          "human_parameter_name": "Oldest Timestamp",
          "human_parameter_description": "Specify the oldest timestamp to filter results from this starting point. Only filters main channel messages, not threaded replies."
        },
        "channel": {
          "type": "string",
          "title": "Channel",
          "examples": [
            "C1234567890",
            "G0123456789",
            "D0123456789"
          ],
          "description": "The ID of the public channel, private channel, direct message, or multi-person direct message to fetch history from.",
          "human_parameter_name": "Channel ID",
          "human_parameter_description": "Specify the channel ID or type (public, private, direct message) to fetch its conversation history."
        },
        "inclusive": {
          "type": "boolean",
          "title": "Inclusive",
          "examples": [
            true,
            false
          ],
          "description": "When true, includes messages at the exact 'oldest' or 'latest' boundary timestamps in results. When false (default), excludes boundary messages. Only applies when 'oldest' or 'latest' is specified.",
          "human_parameter_name": "Include Boundary Messages",
          "human_parameter_description": "Set to true to include messages at the exact start/end timestamps, or false to exclude them."
        },
        "include_all_metadata": {
          "type": "boolean",
          "title": "Include All Metadata",
          "examples": [
            true
          ],
          "description": "Return all metadata associated with messages in the conversation history. When true, includes additional metadata fields that may be present on messages.",
          "human_parameter_name": "Include All Metadata",
          "human_parameter_description": "Set to true to return all metadata associated with messages."
        }
      },
      "description": "Request schema for fetching conversation history from Slack."
    },
    "errorBody": null
  },
  {
    "slug": "SLACK_SEND_MESSAGE",
    "status": 200,
    "version": "20260721_00",
    "description": "Posts a message to a Slack channel, DM, or private group. Provide exactly one visible content mode: `markdown_text` for normal Markdown content, or `blocks` for raw Slack Block Kit layouts. Use `fallback_text` only with `blocks`; it maps to Slack's top-level `text` fallback. Fails with `not_in_channel`, `channel_not_found`, or `channel_is_archived` if the bot lacks access. Rate-limited at ~1 req/sec (HTTP 429, honor `Retry-After`). Not idempotent — duplicate calls post duplicate messages.",
    "inputParameters": {
      "type": "object",
      "title": "SendMessageRequest",
      "required": [
        "channel"
      ],
      "properties": {
        "blocks": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": true
          },
          "title": "Blocks",
          "examples": [
            [
              {
                "text": "# Deploy approval\n\nApprove or reject production.",
                "type": "markdown"
              },
              {
                "type": "actions",
                "elements": [
                  {
                    "text": {
                      "text": "Approve",
                      "type": "plain_text"
                    },
                    "type": "button",
                    "value": "approve_prod",
                    "action_id": "approve_prod"
                  }
                ]
              }
            ]
          ],
          "description": "Use this instead of `markdown_text` only when you need Slack Block Kit capabilities that Markdown cannot express: buttons, approval/reject actions, select menus, checkboxes, radio buttons, date/time pickers, overflow menus, interactive workflow payloads, section accessories, image/video blocks, context rows, two-column fields, multiple action buttons in one row, or rich card-like layouts. Provide raw Slack Block Kit JSON as an array. For normal prose generated by an LLM inside a blocks payload, prefer a Slack markdown block: {'type': 'markdown', 'text': '# Heading\\n\\nBody text'}. Do not use this together with `markdown_text`. If these blocks are the visible content, provide `fallback_text` when notification/accessibility fallback matters.",
          "human_parameter_name": "Slack Block Kit Blocks",
          "human_parameter_description": "Raw Slack Block Kit blocks for interactive or structured layouts. Use Markdown Text for ordinary messages."
        },
        "channel": {
          "type": "string",
          "title": "Channel",
          "examples": [
            "C1234567890",
            "general"
          ],
          "description": "ID or name of the channel, private group, or IM channel to send the message to. Can be specified as either 'channel' or 'channel_id'. Do NOT include the '#' prefix (e.g., use 'general' not '#general') - any leading '#' will be automatically stripped. For DMs, use the channel ID returned by SLACK_OPEN_DM (starts with 'D'); usernames, emails, and user IDs are not valid DM targets. IMPORTANT: org-wide (Enterprise Grid) tokens cannot resolve channel names — Slack returns `team_not_found`. Pass the channel ID (e.g., 'C0ABC12345') instead; use SLACK_LIST_ALL_CHANNELS to find IDs.",
          "human_parameter_name": "Channel",
          "human_parameter_description": "Where to send the message—enter a channel name (like general) or a channel ID (like C1234567890). You can also use a DM or private group. Do not include the '#' prefix; it will be automatically removed if provided."
        },
        "thread_ts": {
          "type": "string",
          "title": "Thread Ts",
          "examples": [
            "1618033790.001500"
          ],
          "description": "Timestamp (`ts`) of an existing message to make this a threaded reply. Use `ts` of the parent message, not another reply. Example: '1476746824.000004'.",
          "human_parameter_name": "Thread Timestamp",
          "human_parameter_description": "Paste the timestamp of the message you want to reply to in a thread (for example 1618033790.001500)."
        },
        "unfurl_links": {
          "type": "boolean",
          "title": "Unfurl Links",
          "description": "Enable unfurling of text-based URLs. Defaults `false` for bots, `true` if `as_user` is `true`.",
          "human_parameter_name": "Unfurl Links",
          "human_parameter_description": "Show previews for regular links you include in the message. Turn on to expand links; turn off to keep them compact."
        },
        "unfurl_media": {
          "type": "boolean",
          "title": "Unfurl Media",
          "description": "Enable media previews (images, videos) from URLs. Set to `true` (default) to show media previews, `false` to hide them.",
          "human_parameter_name": "Show Media Previews",
          "human_parameter_description": "Show image and video previews from links in your message. Enabled by default. Set to false to hide media previews."
        },
        "fallback_text": {
          "type": "string",
          "title": "Fallback Text",
          "examples": [
            "Deploy approval requested for production."
          ],
          "description": "Optional only when using `blocks`. Maps to Slack's top-level `text` field for notifications, accessibility, search previews, and clients that cannot render blocks. This should be a short plain-text summary of the block content, not another visible message body. Omit it if you want Slack to infer fallback text from supported blocks.",
          "human_parameter_name": "Fallback Text",
          "human_parameter_description": "Optional plain-text notification/accessibility fallback for block messages."
        },
        "markdown_text": {
          "type": "string",
          "title": "Markdown Text",
          "examples": [
            "# Status Update\n\nSystem is **running smoothly** with *excellent* performance.\n\n```bash\nkubectl get pods\n```\n\n> All services operational ✅",
            "| Metric | Status |\n|---|---|\n| p95 latency | improved |\n| error rate | stable |",
            "a\n \n \n \nb"
          ],
          "description": "Use this for normal LLM-written message content. Pass standard Markdown exactly as written; this tool sends it to Slack's native `markdown_text` argument without converting it to blocks. Do not use this together with `blocks`. Supports Slack's native markdown handling for headings, bold, italic, links, lists, code, quotes, dividers, tables, and task lists. Slack collapses literal empty Markdown lines; to force visible blank spacer rows, put a non-breaking space on each spacer line, e.g. `a\\n\\u00a0\\n\\u00a0\\n\\u00a0\\nb`. For Slack mentions, use explicit entity syntax such as <@USER_ID>, <#CHANNEL_ID>, or <!subteam^GROUP_ID>; do not rely on @name or #name auto-linking. Use `blocks` instead when you need buttons, selects, checkboxes, image blocks, context rows, fields, accessories, or other interactive/layout controls.",
          "human_parameter_name": "Message Content (Markdown)",
          "human_parameter_description": "Write the message in standard Markdown. It is sent directly to Slack's native markdown_text field."
        },
        "reply_broadcast": {
          "type": "boolean",
          "title": "Reply Broadcast",
          "description": "If `true` for a threaded reply, also posts to main channel. Defaults to `false`.",
          "human_parameter_name": "Broadcast Reply to Channel",
          "human_parameter_description": "If you're replying in a thread, turn this on to also share the reply in the main channel."
        }
      },
      "description": "Request schema for `SendMessage`",
      "additionalProperties": false
    },
    "errorBody": null
  },
  {
    "slug": "GOOGLEDRIVE_FIND_FILE",
    "status": 200,
    "version": "20260721_00",
    "description": "The comprehensive Google Drive search tool that handles all file and folder discovery needs. Use this for any file finding task - from simple name searches to complex queries with date filters, MIME types, permissions, custom properties, folder scoping, and more. Searches across My Drive and shared drives with full metadata support. Examples: - Find PDFs: q=\"mimeType = 'application/pdf'\" - Find recent files: q=\"modifiedTime > '2024-01-01T00:00:00'\" - Search by name: q=\"name contains 'report'\" - Files in folder: folderId=\"abc123\" or q=\"'FOLDER_ID' in parents\"",
    "inputParameters": {
      "type": "object",
      "title": "FindFileRequest",
      "properties": {
        "q": {
          "type": "string",
          "title": "Q",
          "examples": [
            "name = 'Budget 2024'",
            "name = 'Valentine's Day'",
            "name contains 'Jan'26 Schedule'",
            "name contains 'report'",
            "mimeType = 'application/pdf'",
            "mimeType = 'application/vnd.google-apps.folder'",
            "'FOLDER_ID' in parents",
            "modifiedTime > '2024-01-01T00:00:00'",
            "modifiedTime > '2024-10-01T14:30:00' and modifiedTime < '2024-10-01T18:00:00'",
            "createdTime > '2024-10-02T00:00:00' and createdTime < '2024-10-02T23:59:59'",
            "sharedWithMe = true",
            "sharedWithMe = true and name contains 'report'",
            "sharedWithMe = true and mimeType = 'application/pdf'",
            "starred = true and mimeType = 'application/pdf'",
            "trashed = false",
            "'user@example.com' in owners",
            "'user@example.com' in writers",
            "fullText contains 'quarterly results'",
            "name contains 'report' and not name contains 'draft'",
            "(mimeType contains 'image/' or mimeType contains 'video/')",
            "name contains 'invoice' and modifiedTime > '2024-01-01T00:00:00' and trashed = false"
          ],
          "description": "Query string to filter file results. Accepts both simple text searches and full Google Drive query syntax.\n\n        **Simple Text Search:** Bare text (e.g., \"SAM RFP\") is auto-converted to fullText search. Bare email addresses are auto-converted to owner search.\n\n        **Full Query Syntax:** 'field operator value' combined with 'and', 'or', 'not'\n\n        **Operators:** =, !=, <, >, <=, >=, contains, in\n\n        **Common Fields:**\n        - `name` - File name (exact match with = or partial match with contains)\n        - `fullText` - File content search\n        - `mimeType` - File type (e.g., 'application/pdf', 'application/vnd.google-apps.folder')\n        - `modifiedTime`, `createdTime` - Dates (RFC 3339: '2024-01-01T00:00:00')\n        - `parents` - Folder IDs containing the file\n        - `owners`, `writers` - User email addresses (MUST use 'in' operator, NOT colon syntax)\n        - `properties`, `appProperties` - Custom metadata\n\n        **Boolean Filter Fields (sharedWithMe, trashed, starred):**\n        These fields require explicit `= true` or `= false` syntax:\n        - `sharedWithMe = true` - Find files shared with you by others\n        - `sharedWithMe = false` - Find files NOT shared with you (your own files)\n        - `trashed = true` - Find files in trash\n        - `trashed = false` - Exclude trashed files from results\n        - `starred = true` - Find starred/favorited files\n        - `starred = false` - Find non-starred files\n\n        Combine with other conditions using 'and':\n        - \"sharedWithMe = true and name contains 'report'\" - Find shared files with 'report' in name\n        - \"sharedWithMe = true and mimeType = 'application/pdf'\" - Find shared PDF files\n        - \"starred = true and modifiedTime > '2024-01-01T00:00:00'\" - Find recently modified starred files\n\n        **Query Complexity Limits:**\n        Queries with many OR clauses (typically >5-10) may fail with 'The query is too complex' error.\n\n        **Name Field Usage:**\n        Wildcards (*) are NOT supported. Use 'contains' operator for partial matching.\n\n        **User Email Searches:**\n        - CORRECT: \"'user@example.com' in owners\" or \"'user@example.com' in writers\" or \"'user@example.com' in readers\"\n        - INCORRECT: \"owner:user@example.com\" (colon syntax is NOT supported and will cause errors)\n        - Always use the 'in' operator with quoted email addresses for user-based searches\n\n        **Special Syntax:**\n        - Dates: RFC 3339 format (time zone defaults to UTC)\n        - Apostrophes/quotes in values: Automatically escaped. You can write \"name = 'Jan'26'\" or \"name = 'Valentine's Day'\" without manual escaping.\n        - Grouping: Use parentheses for OR: \"(mimeType contains 'image/' or mimeType contains 'video/')\"\n        - Custom properties: \"properties has { key='department' and value='sales' }\"\n\n        **IMPORTANT - Root Folder ('My Drive'):**\n        'My Drive' is NOT a searchable folder name. To work with the root folder, use the 'root' alias: folder_id='root' or \"'root' in parents\" in your query.\n        ",
          "human_parameter_name": "Query for filtering file results",
          "human_parameter_description": "Write a search filter to find the files you want, like name contains 'report' or modifiedTime > '2024-01-01'. Use this to narrow results to exactly what you need."
        },
        "fields": {
          "type": "string",
          "title": "Fields",
          "examples": [
            "*",
            "files(id,name,mimeType)",
            "id,name,mimeType",
            "nextPageToken,files(id,name,mimeType)",
            "files(id,name,modifiedTime,size,webViewLink)",
            "nextPageToken,files(id,name,parents,permissions)"
          ],
          "description": "Selector specifying which fields to include in a partial response. Use '*' for all fields.\n\n**Default Behavior (Recommended for Discovery):**\nWhen omitted, returns essential file discovery fields: id, name, mimeType, size, modifiedTime, createdTime, parents, webViewLink, trashed, starred. This lightweight default is optimized for file search/discovery use cases without verbose permission or capability metadata.\n\n**Format:** For file fields, use 'files(field1,field2,...)' format. For example: 'files(id,name,mimeType)'.\nTop-level response fields (kind, nextPageToken, incompleteSearch) can be used directly.\n\n**Note:** Bare field names like 'id,name,mimeType' will be automatically wrapped in 'files()' for convenience.\nThe 'editors' field is not valid in Drive API v3; use 'permissions' instead for access control information.",
          "human_parameter_name": "Fields to include in response",
          "human_parameter_description": "Choose which fields to return in the results. Omit for lightweight discovery defaults (id, name, mimeType, size, modifiedTime, etc.). Use '*' for all fields or list specific fields like 'id,name,mimeType' (will be auto-wrapped in 'files()'). For permission info, use 'permissions' not 'editors'."
        },
        "spaces": {
          "type": "string",
          "title": "Spaces",
          "default": "drive",
          "examples": [
            "drive",
            "appDataFolder",
            "photos",
            "drive,appDataFolder"
          ],
          "description": "A comma-separated list of spaces to query. Supported values are 'drive', 'appDataFolder' and 'photos'.",
          "human_parameter_name": "Comma-separated list of spaces",
          "human_parameter_description": "Limit the search to certain Google Drive spaces like 'drive', 'appDataFolder', or 'photos'. Use this to focus on the right area."
        },
        "corpora": {
          "enum": [
            "user",
            "drive",
            "domain",
            "allDrives"
          ],
          "type": "string",
          "title": "Corpora",
          "default": "allDrives",
          "examples": [
            "user",
            "domain",
            "drive",
            "allDrives"
          ],
          "description": "Specifies which collections of files to search. Defaults to 'allDrives' (searches My Drive + all accessible shared drives).\n\n        **Values:**\n        - `user` - Search only user's personal My Drive\n        - `domain` - Search all files shared within Google Workspace domain\n        - `drive` - Search specific shared drive (requires 'driveId' parameter and 'includeItemsFromAllDrives' must be true)\n        - `allDrives` - Search My Drive + all accessible shared drives (DEFAULT, requires 'includeItemsFromAllDrives' to be true)\n\n        **When to Use:**\n        - Personal files only: Use 'user'\n        - Organization-wide: Use 'domain'\n        - Specific shared drive: Use 'drive' with 'driveId'\n        - Maximum coverage: Use 'allDrives' (auto-enables supportsAllDrives and includeItemsFromAllDrives)\n        ",
          "human_parameter_name": "Corpora to query",
          "human_parameter_description": "Choose where to search (your drive, a shared drive, your whole domain, or all drives) so the results come from the right place. Defaults to 'allDrives' for comprehensive results."
        },
        "driveId": {
          "type": "string",
          "title": "Drive Id",
          "description": "ID of the shared drive to search. When provided, 'corpora' will automatically be set to 'drive' (mutually exclusive with corpora='allDrives'). Required if 'corpora' is 'drive'.",
          "human_parameter_name": "Shared Drive ID",
          "human_parameter_description": "If you selected a specific shared drive, enter its ID so the search runs only within that drive."
        },
        "orderBy": {
          "type": "string",
          "title": "Order By",
          "examples": [
            "modifiedTime desc",
            "createdTime",
            "name",
            "name_natural",
            "viewedByMeTime desc",
            "quotaBytesUsed desc",
            "folder,modifiedTime desc,name",
            "starred desc,name",
            "recency desc"
          ],
          "description": "Comma-separated sort keys. Ascending by default; add 'desc' for descending. Cannot be used when query (q) contains fullText search terms.\n\n        **Valid Keys:**\n        - `createdTime`, `modifiedTime`, `modifiedByMeTime` - Dates\n        - `viewedByMeTime`, `sharedWithMeTime` - Activity dates\n        - `name`, `name_natural` - File name (natural: file1, file2, file10)\n        - `folder` - Folder hierarchy\n        - `quotaBytesUsed` - Storage size (NOTE: 'size' is NOT valid, use 'quotaBytesUsed')\n        - `starred` - Starred status\n        - `recency` - Recent activity (combines view time and modification time for relevance-based sorting)\n\n        **Important:** 'size' is NOT a valid sort key. Use 'quotaBytesUsed' to sort by file size.\n\n        **Restriction:** Sorting is not supported when the query contains fullText searches (e.g., \"fullText contains 'keyword'\"). Omit orderBy when using fullText queries.\n        ",
          "human_parameter_name": "Sort keys",
          "human_parameter_description": "Pick how results should be sorted (e.g., by name or modified time). Add 'desc' for newest or largest first. Use 'quotaBytesUsed' for size sorting (not 'size'). Note: cannot be used with fullText searches."
        },
        "pageSize": {
          "type": "integer",
          "title": "Page Size",
          "default": 100,
          "maximum": 1000,
          "minimum": 1,
          "examples": [
            10,
            50,
            100,
            500,
            1000
          ],
          "description": "The maximum number of files to return per page.",
          "human_parameter_name": "Maximum number of files per page",
          "human_parameter_description": "How many files to return per page. Larger numbers show more results at once."
        },
        "folder_id": {
          "type": "string",
          "title": "Folder Id",
          "examples": [
            "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
            "root"
          ],
          "description": "ID of a specific folder to search within. This automatically adds \"'folder_id' in parents\" to the query. Can be combined with the 'q' parameter to further filter results within the folder. Use 'root' to search within the user's root folder (My Drive). Note: 'My Drive' is not a searchable folder name - use 'root' alias instead.",
          "human_parameter_name": "Folder ID",
          "human_parameter_description": "Search within a specific folder by entering its ID. Use 'root' to search in the user's root folder (My Drive). This limits results to items inside that folder."
        },
        "pageToken": {
          "type": "string",
          "title": "Page Token",
          "description": "The token for continuing a previous list request on the next page. IMPORTANT: This must be the exact opaque string from a previous response's 'nextPageToken' field - do not modify, truncate, URL-encode, or construct tokens manually. Invalid or corrupted tokens will result in API errors.",
          "human_parameter_name": "Page token",
          "human_parameter_description": "If you're continuing a previous search, paste the next page token here EXACTLY as returned from the previous response's 'nextPageToken' field. Do not modify the token in any way."
        },
        "include_labels": {
          "type": "string",
          "title": "Include Labels",
          "examples": [
            "label_abc123",
            "label_xyz789,label_def456",
            "priority_label,status_label,department_label"
          ],
          "description": "A comma-separated list of label IDs to include in the `labelInfo` part of the response for each file. Empty strings are automatically treated as omitted.",
          "human_parameter_name": "Include labels",
          "human_parameter_description": "Provide one or more label IDs (comma-separated) to include label details in each file's results."
        },
        "pagetoken_dropped": {
          "type": "boolean",
          "title": "Pagetoken Dropped",
          "default": false,
          "description": "Indicates whether the page token was dropped from the request."
        },
        "supportsAllDrives": {
          "type": "boolean",
          "title": "Supports All Drives",
          "default": true,
          "description": "Whether the requesting application supports both My Drives and shared drives. If 'includeItemsFromAllDrives' is true, this must also be true.",
          "human_parameter_name": "Supports all drives?",
          "human_parameter_description": "Confirms your app supports searching shared drives as well as My Drive. Keep this on if you plan to search across all drives."
        },
        "original_email_query": {
          "type": "string",
          "title": "Original Email Query",
          "description": "The original email query before transformation."
        },
        "editors_field_removed": {
          "type": "boolean",
          "title": "Editors Field Removed",
          "default": false,
          "description": "Indicates whether the editors field was removed from the request."
        },
        "email_query_transformed": {
          "type": "boolean",
          "title": "Email Query Transformed",
          "default": false,
          "description": "Indicates whether an email query was transformed into a search filter."
        },
        "orderby_size_transformed": {
          "type": "boolean",
          "title": "Orderby Size Transformed",
          "default": false,
          "description": "Indicates whether the orderBy size value was transformed."
        },
        "original_bare_text_query": {
          "type": "string",
          "title": "Original Bare Text Query",
          "description": "The original bare text query before transformation."
        },
        "includeItemsFromAllDrives": {
          "type": "boolean",
          "title": "Include Items From All Drives",
          "default": true,
          "description": "Whether both My Drive and shared drive items should be included in results. Must be true when corpora is 'drive' or 'allDrives'. If true, 'supportsAllDrives' should also be true.",
          "human_parameter_name": "Include items from all drives?",
          "human_parameter_description": "Include files from both My Drive and any shared drives you can access. This must be true when searching across drives. Turn this on for the most complete results."
        },
        "emailaddress_field_removed": {
          "type": "boolean",
          "title": "Emailaddress Field Removed",
          "default": false,
          "description": "Indicates whether the email address field was removed from the request."
        },
        "original_invalid_pagetoken": {
          "type": "string",
          "title": "Original Invalid Pagetoken",
          "description": "The original invalid page token that was dropped."
        },
        "bare_text_query_transformed": {
          "type": "boolean",
          "title": "Bare Text Query Transformed",
          "default": false,
          "description": "Indicates whether a bare text query was transformed into a search filter."
        },
        "include_permissions_for_view": {
          "type": "string",
          "title": "Include Permissions For View",
          "examples": [
            "published"
          ],
          "description": "Specifies which additional view's permissions to include in the response. Must be either omitted entirely or set to 'published'. Empty strings are automatically treated as omitted.",
          "human_parameter_name": "Include permissions for view",
          "human_parameter_description": "Include extra permission details for a specific published view when needed. Use 'published' to see who can access published content."
        }
      }
    },
    "errorBody": null
  },
];

/**
 * Lookups go through a Map rather than a record literal, for the reason
 * ./capabilities.ts gives at the same seam: `noUncheckedIndexedAccess` is off in
 * this repo's tsconfig, so `RECORD[missingSlug]` is typed as present while being
 * `undefined` at run time — and "the recording has no entry for this slug" is
 * precisely the fact the coverage check exists to notice.
 */
const BY_SLUG = new Map(COMPOSIO_CATALOG_RECORDING.map((entry) => [entry.slug, entry]));

/** The recorded response for one slug, or null when it was never captured. */
export function recordedTool(slug: string): RecordedTool | null {
  return BY_SLUG.get(slug) ?? null;
}

/** Every slug in the recording, sorted. Stable order for a check's detail line. */
export function recordedToolSlugs(): readonly string[] {
  return [...BY_SLUG.keys()].sort();
}

/**
 * The slugs whose schema this runtime can actually read, sorted.
 *
 * SEPARATE FROM `recordedToolSlugs` ON PURPOSE. A slug that answered 404 is
 * recorded and covered — somebody looked — but there is no schema behind it, so a
 * check that iterated the recording expecting twelve parseable entries and got
 * fourteen would be asserting the parser is broken when it is Composio's catalog
 * that is short.
 */
export function recordedToolSlugsWithSchema(): readonly string[] {
  return COMPOSIO_CATALOG_RECORDING.filter((entry) => entry.inputParameters !== null)
    .map((entry) => entry.slug)
    .sort();
}
