---
name: tripo-studio-pipeline
description: Run and monitor Tripo Studio multi-view jobs through the visible web UI, including HD model generation, Smart Low Poly retopology, and 8K texture generation. Use for scanning, previewing, submitting, checking, or safely resolving the local Tripo batch queue; not for Tripo API integration or reverse-engineering private requests.
---

# Tripo Studio Pipeline

Use the existing queue tool rather than recreating browser logic. Invoke it through [scripts/invoke.ps1](scripts/invoke.ps1), which locates the maintained tool and preserves its local Chrome profile, artifacts, and state.

## Choose the operation

- Inspect only: run `scan` to validate view files and `status` to read checkpoints.
- Verify one asset without spending credits: run `preview --asset <id>`. It uploads the images but does not click Generate.
- Run the full paid workflow: run `pipeline`, optionally with `--asset <id>` or `--limit <n>`. The configured workflow is multi-view HD → Smart Low Poly v2, triangle topology, target 10,000 faces → 8K texture.
- Use `run` only when the user wants HD generation without the later retopology and texture stages.
- If login is missing, run `login` and let the user complete login in the dedicated Chrome window. Never copy or extract cookies, passwords, or Chrome profile data.

Example from PowerShell:

```powershell
& "$env:USERPROFILE\.codex\skills\tripo-studio-pipeline\scripts\invoke.ps1" scan
& "$env:USERPROFILE\.codex\skills\tripo-studio-pipeline\scripts\invoke.ps1" pipeline --limit 1
```

## Preserve the credit boundary

`pipeline` and `run` spend the user's Tripo Studio credits. Run them only when the current request authorizes real submissions. State the selected asset count before starting; do not infer permission to add assets or repeat failed jobs. Studio pricing can change, so treat previously observed costs as historical rather than guaranteed.

The queue writes a checkpoint before every paid click. If it reports `uncertain`, `submitting`, or `processing` and stops, inspect the Studio asset list and the recorded screenshot before changing state. Never resolve as `retry` unless the user or visible Studio state confirms that no task was accepted. Use:

```powershell
& "$env:USERPROFILE\.codex\skills\tripo-studio-pipeline\scripts\invoke.ps1" resolve --asset <id> --as completed --confirm
& "$env:USERPROFILE\.codex\skills\tripo-studio-pipeline\scripts\invoke.ps1" resolve --asset <id> --as retry --confirm
```

Do not bypass CAPTCHA, concurrency limits, login checks, or credit checks. Do not replay or imitate Tripo's internal network requests; this workflow deliberately uses the visible Studio interface.

## Input contract

Each asset is one subdirectory under the tool's `inputs` directory. The default mapping requires `front`, `left`, and `right` images. Run `scan` before any paid operation; if any asset is invalid, fix or exclude it rather than guessing its view direction.

After a run, report the completed/uncertain counts, final checkpoint status, artifact screenshot path when present, and whether the queue can be safely resumed.
