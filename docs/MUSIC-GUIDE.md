# Tyler DJ — experimental YouTube tab music

Music plays through the existing Steam synthetic microphone independently
of AI speech mode. Keep AI in **Text** mode, or connect soundboard only.
The bot account must remain joined to the Steam voice channel. This is
a Chrome extension feature; Electron and the native companion are unchanged.

## First setup

1. Update the contents of your SAME existing unpacked extension folder,
   reload the extension and reopen Steam web chat. Include every file and
   the neural folder. Chrome may ask you to enable the added YouTube access.
2. Connect Tyler to the desired Steam text chat. Use Text mode if you want
   conversation replies only in text. Join Steam voice with the bot account.
3. Open **Tyler DJ · Music in Steam voice** in the Conversation panel.
4. Click **1 · Open YouTube music tab**. This creates or focuses one dedicated
   YouTube tab. Accept any site consent there yourself if needed.
5. Return to Steam and click **2 · Share that tab’s audio**. In Chrome’s picker,
   choose the **YouTube tab**, enable **Share tab audio**, and share. Do not
   select Steam, your desktop or a window. The picker must return tab audio.
6. A friend types `!play artist song` in the connected Steam chat.
7. If autoplay is blocked, click Play in the YouTube tab once. Keep it open.

## Chat commands

| Command | Action |
|---|---|
| `!play ARTIST SONG` | Search YouTube and queue a request |
| `music play ARTIST SONG` | Alternate request form |
| `tyler play ARTIST SONG` | Alternate request form |
| `music skip` | Two votes for groups; one vote from the confirmed sole voice listener |
| `music pause` / `music resume` | Pause or resume music |
| `music stop` | Vote to stop and clear music; two different accounts required |
| `music clear` | Empty waiting songs; current song and its skip votes stay unchanged |
| `music reset` | Shares the stop vote; two different accounts stop/reset music |
| `music queue` / `music now` | Show queued/current requests |
| `music volume 35` | Set relay volume, 0–200 |
| `music help` | Show command help |

The Music panel also accepts requests and volume changes. **Stop music &
sharing** releases the capture tracks as well as stopping playback. Ending
Chrome sharing pauses music. Emergency stop or losing the bot lease also
disconnects the relay. Normal AI pause/mode changes do not stop music.

If requests fill the queue, type **music clear** to remove waiting songs
without interrupting the current one. **music reset**, after two different
people vote, stops everything and clears votes too, keeping YouTube tab
sharing ready for a fresh request. The local panel Reset music is immediate.
Both also accept **!music clear** / **!music reset**, have matching panel
buttons, and require no sender-ID setup. Reset discards pending music
commands/events already waiting in Tyler's local processing queue. New
requests after it completes are accepted normally. These commands clear
the current queue; they do not block future requests from friends.

## Music spam protection (2.3.21)

Friends can make one song request every **5 seconds** per detected account;
other music commands have a **2-second** per-person cooldown. Room bursts
allow **8 accepted commands per 10 seconds**; stop/reset votes are exempt
from that room cap so requests do not crowd them out. Chat clear has a
**10-second** cooldown. Unknown accounts share one bucket, so changing an
unverified display name does not bypass the guard. Existing limits of three
waiting songs per person and twelve overall still apply.

Blocked spam is shown quietly in the panel. Music chat notices are spaced
at least three seconds apart, with one pending notice maximum and priority
for now-playing cards. There is a twelve-command processing limit and a
fifteen-second controller timeout, instead of an unlimited stuck backlog.
Where Steam supplies message IDs, redraws of an old command do not replay it.

Your panel's **Clear waiting queue** and **Reset music** buttons bypass chat
cooldowns and discard pending chat commands. **Pause chat music commands**
temporarily blocks all chat music controls while the current player and
automatic song transitions continue; panel controls stay available. Click
**Resume chat music commands** to allow requests again. Chat resets do not
erase cooldowns or override the panel lock.

## Two-person stop and sender fix (2.3.22)

**music stop** needs two different detected accounts, just like skip.
**music reset** joins that same stop vote. Repeating either command or
changing a nickname does not add another vote for the same account.
Skip and stop counts are separate: one skip plus one stop does not pass.
Both counts reset on a new track. Local panel controls remain immediate.

## Solo skip (2.3.23)

If **exactly one other person** is in Tyler's active voice channel, that
person can type **music skip** once. Tyler checks the actual voice member
list, including silent/muted members, and matches the voter to the sole
listener's account. A different text-chat member does not get this exception.
Each skip checks again, so friends joining restores the two-vote rule.
Keep the active voice channel visible. If membership is not clear or belongs
to a different group, two skip votes remain required. The Music panel reports
the confirmed count or why it is using two votes. Stop/reset remain two-vote
commands even when solo. This does not require AI voice mode or admin rights.

The sender adapter now follows the owning React component for Steam's
actual `msg.unAccountID` / `context.unAccountIDSender` fields, identified
from the installed Steam interface source. It stays inside the current
message and ignores bot-account and quoted-sender data. This fixes a
missing layer in the earlier DOM-only property probe.

Close both old Steam and Tyler YouTube tabs when updating, then reopen
them through the normal setup. **v2.3.22** should be visible, and Sender
check should report each friend's name and **ready for skip/stop votes**.
If it says to reopen Steam, the new message adapter is not active in that
old page. Live Chrome recognition still needs this check after installation.

## Group DJ features (2.3.19)

- Requests show the sender's name automatically, with no ID entry. The local
  panel labels its own requests **DJ host**. Unknown senders use **Someone
  in chat**, sharing one anonymous request bucket.
- Each person can have at most **3 waiting songs**. The queue rotates between
  requesters, preserving each person's song order. New people get a turn
  ahead of a repeat turn; shown positions can change when someone joins.
- **music skip** needs exactly **2 different accounts**. Repeating the command
  or changing a nickname does not add a vote for the same detected account.
  Votes reset for every song. v2.3.23 allows one skip vote from the confirmed
  sole voice listener; stop/reset stay at two. The DJ can use **Skip now**
  in the Music panel to skip immediately.
- Skip votes require a numeric Steam account identity read automatically
  from the message's own sender/profile markup or bounded React message
  metadata. Nobody has to enter an ID. The shared v2.3.21 reader recognizes
  Steam's speakerName author header and is also used by other chat features.
  Display names, matching cached names, mentions and vanity links alone do
  not count as vote identity. This prevents a nickname from becoming another
  vote. Sender recognition still depends on Steam's page layout.
- **Sender check** in the Music panel reports **ready for skip votes** or
  **name only / sender not detected**. Have each person send a new message
  and check this line. **Check latest sender** also inspects the latest
  visible message. If recognition fails, reconnect the chat reader. This
  build does not claim that your exact live layout has been verified.
- Now-playing messages use a compact music card in Steam chat: actual player
  title, requester name, next song/requester and waiting count. **music now**
  shows that card; **music queue** lists up to six upcoming turns with names.

Example Steam chat card (plain text and emoji, not extension-only styling):

```text
🎶 ━━━ NOW PLAYING ━━━
▶ Artist — Song
👤 Requested by Alex
⏭ Next: Another song · Sam
🎧 3 waiting · music queue · music skip
```

## Sources and behavior

This controls the ordinary visible YouTube browser player and relays the tab
audio explicitly shared through Chrome. It does not extract/download media
URLs, access a private music API or bypass DRM. It selects the first regular
video result in native YouTube search; an exact artist/title/version is not
guaranteed. It may select a cover, live version, long video or other result.
Use skip or more specific request text when that happens.

YouTube ads, consent screens, regional restrictions, unavailable content and
autoplay rules still apply. Ads may be audible in the shared tab. Native
search/player layout changes can break automatic selection. A Play click
may be necessary after opening or navigation. This is experimental browser
control, not an official YouTube music-streaming integration. Spotify search
and playback are not included in this build.

There are 12 waiting queue slots; exact duplicate active/waiting song queries
are rejected. Queue state is held in the Steam page and is lost on refresh.
Only the dedicated configured YouTube tab is controlled. Existing history
is marked read when binding so old song commands are not intentionally
replayed. Music commands are kept out of ordinary AI text replies.

Chrome's tab sharing includes a video track to keep capture alive. The bot
connects only its audio tracks to the voice mixer; it does not record, save
or transmit the video track. The selected tab's audio is transmitted to the
Steam voice channel while sharing. No extra physical microphone is opened.
After sharing, check the Steam voice meter and have a friend confirm audio.

Automated checks cover parsing, tab routing, sender validation, fair queue
rotation, distinct-account skip votes, chat cards, stale/repeated player
events and separation from AI stop. Actual Chrome tab capture, YouTube
playback, sender recognition in your live Steam layout and audio delivery
have NOT been verified by the patch tests. Your existing working playback
setup is retained.
