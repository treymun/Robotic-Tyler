# Shared Chrome sender reader (v2.3.22)

Steam's author header in the supplied screenshot is `speakerName`. The
earlier label reader missed that class, and most other text features still
used an older reader requiring custom `data-author-steamid` attributes.

There is now one implementation in `browser-extension/identity.js`. The
trivia/music compatibility names delegate to it, and the other text features
already call its account reader. It distinguishes a visible label from an
actual numeric account key. Only numeric keys satisfy existing account
permissions, personal memory, verified score credit and distinct skip votes.

The reader checks author headers, grouped message wrappers, explicit sender
attributes, profile links and avatar account attributes. It keeps names and
account IDs from separate wrappers together without using other chat rows.
Per-chat caches map known IDs to labels, never a matching name to an ID.

`sender-main.js` supplies a fallback for React-rendered messages whose
numeric author key is not present in HTML attributes. It reads only bounded,
named sender/message fields attached to that message's own DOM elements.
It does not traverse arbitrary children or global stores, invoke getters,
read authentication data, fetch anything or send messages. A synchronous
DOM event connects it to the isolated reader, and stamps are refreshed
for each read so reused DOM nodes cannot retain an earlier sender.

The v2.3.22 correction follows bounded React **parent** component links.
Steam's installed interface source shows the sender on `msg.unAccountID`
and the BBCode renderer's `context.unAccountIDSender`. Those fields are
often on the owning component, rather than the direct DOM host props read
by v2.3.21. Traversal stops before a different message or history container.
The current message's outer msgText is used instead of a quoted child.
The selector helper also explicitly supports the actual `.msgText` class.

Normal AI text replies can use a visible author label even without an
account key. Label-only identity does not load private friend memory.
Other account-based features keep their original access and enablement
settings. No account IDs are typed in to make automatic recognition work.

## Check after installing

Close old Steam tabs before replacing/reloading the extension; the new
MAIN-world script starts on a fresh page load. Confirm **v2.3.22** appears
in Tyler DJ and Sender check. Each friend should send a fresh message.
**Ready for skip/stop votes** means a numeric account was read. **Name only**
means labels work but account-specific actions cannot count that person yet.

Tests cover the observed speakerName class, representative grouped markup,
React message metadata, conflicting identities, mentions, reused nodes,
nickname changes and actual consumers across music, trivia, AI text replies,
game votes, party membership, roasts and custom commands. The full live
Steam message structure was not available; this patch is not a claim that
the running page has already passed these checks. Voice diarization is
separate and is not added by this text-author fix. v2.3.22 was checked against
the installed Steam interface's real sender-field structure; the live Chrome
session itself was not inspected or operated.
