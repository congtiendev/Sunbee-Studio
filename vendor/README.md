# Vendored third-party material

## video-shotcraft/

- Source: https://github.com/Vincentwei1021/video-shotcraft
- Commit: `6700db2ba80572ebc777b99d72049679fed9840c` (2026-11-12)
- License: Apache License 2.0 — see `video-shotcraft/LICENSE`.
- Contents: `SKILL.md` and `references/` only, copied unmodified (the repo's
  demos, assets, template and tools are not included).

Used by the video-render module (`server/modules/video-render/`): the folder
is uploaded as-is to the user's Anthropic workspace as a custom Agent Skill
and loaded into Claude's code-execution container when Claude storyboards a
render project. Sunbee's own Remotion shot components in
`renderer/src/shots/` adapt a few of the skill's demo techniques — see
`renderer/NOTICE`.

To update: copy `SKILL.md`, `references/` and `LICENSE` from a newer commit
and bump the commit above. A changed folder is uploaded as a new skill
automatically (it's keyed by a hash of its contents).
