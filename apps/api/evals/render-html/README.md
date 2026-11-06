# render-html eval

Checks how a real model follows the chat's model-facing text in `src/agent/prompt.ts`: it should call `render_html` with one self-contained page (no requests except cdnjs.cloudflare.com) when a chart, table, diagram or comparison answers better, and answer in prose otherwise. The prose cases are controls.

Run it when you change `SYSTEM` or the `render_html` description or schema. Unit tests can't catch those changes, because model output varies from run to run.

## Run

```sh
cd apps/api
vp run eval:render-html --out runs/base                      # every case, 3 samples, the chat's model
vp run eval:render-html --out runs/new --baseline runs/base  # after your change, same model
vp run eval:render-html --out runs/x --case fact --samples 1 # check the setup first
```

It needs `ARKIE_ANTHROPIC_API_KEY` in the shell or the repo root `.env`, and it prints its token count. A full run is 18 short requests: a few cents on Sonnet. CI only runs `grade.test.ts`. `runs/` is gitignored.

## Add a case

Add it to `cases.ts` with a `source` (the report, PR or rule it came from) before you change the prompt. It must fail on the old text and pass on the new. A case fails when half or more of its samples fail. Compare against a baseline on the same model, not against a fixed score.
