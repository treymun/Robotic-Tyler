[README](../README.md) · [Getting started](GETTING-STARTED.md)

# Vote kick, text mute and Steam admin

These controls are in Tyler's panel → **Room**, in the desktop app and in the Chrome extension. Each one is off until you turn it on. They use permissions the bot's Steam account already has. Tyler cannot grant himself a role.

This is experimental. The automated checks use simulated Steam objects. No live member was kicked and no live role was changed while they were written. A real Steam group can still disagree with the private page structure Tyler reads.

## Five-minute text mute votes

1. Give the bot Steam message-deletion permission and enable **local admin
   controls** in **Room → Steam admin**.
2. Open **Room → Vote kick & text mute**, check permissions, and enable
   **five-minute vote-to-text-mute** for this group. This separate option
   defaults off and is independent of the kick-vote option.
3. Type `!votemute NAME`. Other members vote with `!mute yes` or `!mute no`.
   Three different eligible yes voters start the mute. The caller's start
   counts as their first yes. A panel-started vote still starts at zero.

`!mute status` shows the ballot and remaining mute times. `!mute cancel`
lets the caller or group owner cancel a pending mute ballot. The local
**Cancel current vote** button can also cancel it. `!modhelp` shows the
commands. Use **Unmute selected member** in Steam admin to end a mute early.
The admin panel shows countdowns for active timed mutes.

Kick and mute votes share **one ballot slot**. Each ballot lasts 60 seconds;
three no votes reject it. Wrong-type commands cannot cross-count votes.
Repeating a vote or changing a nickname cannot add votes. Owner/bot targets
are protected and the target/bot cannot vote. Current membership and actual
Steam message metadata are checked again when applying the result.

The mute lasts **five minutes from the passed vote**, automatically deleting
only that account's new messages in the connected text channel. Earlier
messages remain. A new vote cannot extend a currently active mute. Expiry
is checked before every deletion, including queued requests, so browser
timer delays cannot extend it. This is a session-only automatic deletion
feature; posted text may appear briefly. Voice permissions do not change.

Disabling mute votes clears timed vote mutes while preserving direct manual
mutes. Disabling local admin controls, stopping/reloading Tyler, changing
chats or losing the active tab ends session text mutes. Tyler must remain
connected and have permission to delete the particular sender's messages.
The queue and timestamp limits below continue to apply.

## Local admin panel

In **Room**, open **Steam admin**, click **Check permissions & refresh
members**, and enable **local admin controls for this group**. Give the bot
the corresponding permissions through Steam's group role settings first.
Tyler cannot grant itself permissions. This enablement is separate from
vote-to-kick; turning one off does not turn the other on.

- **Ban selected member until unbanned** applies a Steam group ban with no
  automatic expiry. The owner and bot are protected.
- **Refresh Steam ban list**, select a banned member, and **Unban selected
  member** to remove the ban.
- **Choose one chat message**, click its text, review the preview, then
  **Delete selected message**. Steam must allow that particular deletion.
  Changed selections are rejected. There is no bulk history deletion.
- **Text mute selected member from now on** deletes that person's new text
  messages in the connected channel using their Steam account identity.
  Earlier messages and other people’s messages remain. Choose them under
  **Muted member** and press **Unmute selected member** to stop.
- **Refresh moderation log** shows Tyler's recent actions in this Chrome
  profile, including confirmed kicks. It is not a log of all Steam activity.

Text mutes last only for the current connected session. Disabling admin
controls, emergency stop, leaving the connected group/channel, reloading
or closing Tyler ends them. They do not change voice permissions. Tyler
must stay connected with Steam message-deletion permission. Messages may
appear briefly before deletion: this is an automatic deletion feature,
not a server-wide mute. Steam timestamps have one-second precision; the
initial partial second is left untouched to protect earlier messages.
Only new loaded messages are watched. Older history is never swept.
The queue is bounded to 30 messages and skips messages over 20 seconds
old, so overwhelming spam can exceed it. The panel reports errors.

Direct admin controls operate only from the local panel. Chat members cannot
invoke bans, unbans, individual message deletion or indefinite manual mutes.
The separately enabled vote system can start a five-minute text mute.
Native admin actions and kicks do not overlap. Unconfirmed actions are
not retried automatically. An already-issued deletion cannot be undone by
unmuting. The log retains at most 150 actions total, displaying the latest
50 for the selected group; it stores no message text or API credentials.

## Vote-to-kick

The bot's Steam account can perform a one-hour **group-chat kick** after
three different eligible members vote yes. This removes the person from
the chat group, rather than only disconnecting their voice. It does not
permanently ban them, and Tyler does not automatically invite them back.

## One-time setup

1. Install the current desktop app or Chrome extension and press **Connect & start**
   on the group chat. Music is separate: see [MUSIC-GUIDE.md](MUSIC-GUIDE.md) if you use it.
2. As the Steam group owner, open the group chat's permissions.
   Give **the bot's Steam account** a role that can kick group members.
   Assign that role to the bot. Tyler cannot grant itself permissions.
3. In Tyler's panel, open **Room → Vote kick & text mute** and click
   **Check permissions & members**. The panel must report kick permission.
4. Turn on **Enable one-hour vote-to-kick for this Steam group**. This is saved for
   that group on this PC. New groups default to disabled.

No manual Steam IDs are needed. Targets come from Steam's member list,
and voters are identified from their actual incoming message metadata.
Existing owner enablement and emergency-stop settings are respected.

## Chat commands

| Command | Result |
|---|---|
| `!votekick NAME` | Start a vote against that exact current member name |
| `!kick yes` | Cast your one yes vote |
| `!kick no` | Cast your one no vote |
| `!kick status` | Show the ballot |
| `!kick cancel` | Vote caller or group owner cancels an open ballot |
| `!kick help` | Show commands |

The caller's start command counts as their first yes vote. **Three different
yes accounts** pass. Repeating messages or changing a nickname cannot add
a vote. Each person gets one choice per ballot. The target and bot cannot
vote, and new arrivals are not added to an already-running ballot.

The ballot expires after **60 seconds**. Three no votes reject it early.
Only one ballot runs at a time. **There is no cooldown between ballots**:
another can start immediately after the previous one finishes, is cancelled,
is rejected or expires. A passed/executing ballot remains locked until its
kick finishes. A second native kick cannot overlap an in-flight Steam request.
The group owner and bot are protected targets. Steam must also permit the
bot to kick that particular person. If names are ambiguous, use the panel's
member dropdown and **Call kick vote**; a panel-started vote has zero initial
votes and still needs three people. **Cancel current vote** is a local control.

The kick happens automatically when the third eligible yes vote passes;
there is no additional approval step per kick. Permissions, current group,
membership, target protection and vote freshness are checked again before
calling Steam's one-hour kick action. A ballot is executed at most once.
Old/replayed commands cannot contribute fresh votes. Switching groups,
disabling moderation or emergency stop cancels pending ballots. An already
issued Steam action cannot be undone by cancelling the old vote.

## What was verified

Steam's installed interface source supplied the member, role, deletion and
KickUser controls used by this adapter. Automated tests cover the extension
controllers plus the bridge using simulated Steam objects, including three
distinct voters, repeats, owner protection, missing permission, exact timed
mute expiry, delayed deletion queues, old messages, disabling, group changes
and at-most-once kicks.

No live members were kicked and no live roles were changed during testing.
This depends on private Steam page structures and remains experimental until
you confirm it in your own group. Small loaded friend-group member lists are
supported; large virtualized member lists are not. If a control is unavailable,
the panel reports it and does not invent a successful kick.
