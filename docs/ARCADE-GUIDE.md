# After Hours Arcade

Connect Tyler to the Steam text chat. In the panel, open **Sounds → Arcade**
and leave **Chat sound commands and chat games on** ticked (it starts ticked).
Start from **Start a round** and **Play**, or type one of these phrases in chat.

| Start | How to answer |
|---|---|
| `play vault` | A number from `1` to `20`; higher/lower hints |
| `play scramble` | The unscrambled word, e.g. `portal` |
| `play trivia` | `A`–`D`, `1`–`4`, or the answer. 500 questions, 10 categories: see [TRIVIA-GUIDE.md](TRIVIA-GUIDE.md) |
| `play hangman` | One letter, or `guess dragon` for a whole word |
| `play math` | A number, including a negative answer if needed |
| `play riddle` | The answer, or `guess your answer` |
| `play reverse` | The five digits backwards, including any leading zeros |
| `play rps` | `rock`, `paper`, or `scissors` |

`start trivia`, `arcade trivia` and the old `!game trivia` syntax also work
as arcade starters. `!trivia` stays reserved for the separate Squad trivia
feature; use `play trivia` for this arcade.

During a round: `hint`, `skip`, `stop game`, or `game status`.
Afterward: `play again`. Type `arcade` for the game list.
You can also say `the answer is Minecraft`, `my guess is 12`, or `is it portal?`.
Existing `!game guess ANSWER`, `!game roll`, `!game coin heads/tails`, and
`!game rps rock/paper/scissors` commands remain supported.

One shared round runs at a time and expires after two minutes. Most rounds
have six attempts; Hangman allows eight misses. Repeated guesses do not
cost another attempt. Correct Hangman letters do not consume misses.
Hints are limited to one per round. Starting a new game does not overwrite
an active round; end or skip it first.

Natural answers are accepted only while a matching round is open. The reader
ignores unrelated sentences. For ambiguous word guesses, use `guess WORD`.
Hangman consumes isolated letters, and number puzzles consume isolated
numbers while active. Gameplay is text-only; spoken answers are not wired
to the arcade. Optional AI commentary still uses the configured provider.

The multiplayer `!trivia` / `!answer` system in Squad Suite is separate and
retains its existing account/feature requirements (it asks questions from the
same 500-question bank). The After Hours Arcade
uses the soundboard's existing chat permissions. Everyone mode allows play
without a verified Steam ID; the per-friend leaderboard still needs verified
identity, while room clears count all participants.
