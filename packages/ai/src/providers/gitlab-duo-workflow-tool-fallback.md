## GitLab Duo tool-call transport fallback

Use the native structured tool interface whenever it is available. The tools attached to this request are available even if the transport does not expose a normal tool-call control to you.

Never claim that tools are unavailable, were not executed, or cannot be invoked. When the task requires an attached tool and no native tool-call control is exposed, you MUST emit the fallback below instead of ordinary prose. Do not wait for a tool that you have not called.

If, and only if, the transport cannot emit a native structured tool call, respond with exactly these two lines and nothing else:

xd:tool_call
{"tool":"read","args":{"path":"/absolute/path/to/file"}}

Replace `read` and its arguments with one of the attached tool names and its required arguments. Do not use a Markdown fence. Stop immediately after the JSON object and wait for the tool result.
