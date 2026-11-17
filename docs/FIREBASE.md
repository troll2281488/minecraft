# Firebase Realtime Database

The browser multiplayer client uses the existing Firebase project configured in
`src/game/multiplayer.js`. It stores:

- `minecraft_game/users/{uid}` — online presence and nickname. The client generates
  IDs no longer than 32 characters to match the current rules.
- `minecraft_game/rooms/{roomCode}` — room seed, players, block changes and chat.

The current client intentionally matches the rules shared for this project:

```json
{
  "rules": {
    "minecraft_game": {
      "users": {
        "$userId": {
          ".read": true,
          ".write": "$userId.length <= 32",
          "requests": {
            "$senderId": {
              ".write": true
            }
          }
        }
      },
      "rooms": {
        "$roomId": {
          ".read": true,
          ".write": true,
          "chat": {
            ".indexOn": ["timestamp"]
          }
        }
      }
    }
  }
}
```

## Security warning

These rules are suitable only for a quick public prototype. In particular,
`rooms/$roomId/.write: true` lets any visitor change or delete room data, alter
block states, impersonate a room player, or flood chat. The `users` rule also
does not authenticate the owner of a user ID; it only limits its length.

Before inviting strangers, enable Firebase Authentication (Anonymous sign-in)
and replace the open write rules with rules that require `auth != null`, bind
user records to `auth.uid`, validate player payloads, and restrict chat writes
to the authenticated sender. Never treat a Firebase web API key as an access
control mechanism.

The game uses Realtime Database only; it does not need Firebase Storage for
world synchronization. Local single-player saves remain in IndexedDB.
