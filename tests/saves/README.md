# Golden saves

Every tagged version of the game commits a world save here, named for the version that wrote it:

```
v0.1.0.mcw
v0.2.0.mcw
...
```

`tests.html` loads **all** of them on every run and asserts each one opens, migrates to the current
`DATA_VERSION`, and round-trips without data loss.

This directory is the mechanism behind the project's central promise — that a world created in any
version still opens in every later version. A compatibility guarantee that is never tested is one
that has already been broken and nobody has noticed yet. These files are how it gets noticed
immediately, in the commit that breaks it.

**Never regenerate or edit these files.** Their value comes entirely from being untouched artifacts
of the version that produced them. If a golden save fails to load, the correct response is to fix
the loader or write a migration — never to re-record the save.

Each save should be small but non-trivial: some generated terrain, some player-placed blocks, a
non-empty inventory with a damaged tool, and at least one block entity such as a chest with
contents.
