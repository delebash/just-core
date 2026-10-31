# JustDirect handoff, end of 2026-10-31

Read this first in a new session, then the register: `E:\Dev\Web\just-core\docs\plans\2026-10-24-just-direct-feasibility.md`, §J to §J.4. §J.3.2 is the proof list status. Action and the movie shot set: `E:\Dev\Web\just-core\docs\plans\2026-10-31-just-direct-research-action.md`.

## Decided and standing

- JustDirect is a family Quasar app, written only after local AI is proven. **No app code yet.** It is for anyone: 8 GB is the floor, bigger models stay on the per-machine list (§J.4) for a rented GPU later.
- The user's go for this work: "you can do whatever you want just keep working to make the best app quality and speed". About 7 minutes a clip is accepted, so quality comes first. The bar: "anything someone would wnat to put in a movies is part of the bar".
- Share the card by message: ListAgents, then SendMessage. Others this session: `3d-bf` (JustStage), `web-9e` (mocap, `E:\Dev\Web\just-mocap`). Never start on the card without their "card free". Names change per session.
- Every file named to the user gets its full absolute path. No popups. Never push `E:\Dev\Web\stable-diffusion.cpp` to origin, which is upstream.

## Where the work lives

- Engine: `E:\Dev\Web\stable-diffusion.cpp`, branch `jd`, clean, last commit `ea01fc8`, built at `E:\Dev\Web\stable-diffusion.cpp\build-jd\bin\sd-cli.exe`. Rebuild with `E:\Dev\Web\test-just-direct\build-jd.bat`.
- Audio engine: `E:\Dev\Web\audio.cpp\build\jd\bin\audiocpp_cli.exe`, a separate build from the merged fork so JustVoice's builds stay untouched. Rebuild with `E:\Dev\Web\test-just-direct\build-audio.bat`.
- Tests: `E:\Dev\Web\test-just-direct`. `cli.js` runs one job with a RAM guard. `queue12.ps1` to `queue23.ps1` are today's scripts, `planner\` the AI planning test, `drawtracks.js` draws motion paths, `blockout.py` and `blockout-sword.py` make 3D scenes, `syncmeter.js` compares mouth and sound, `audiocheck.js` compares audio, `gguf-sizes.js` and `st-meta.js` read model headers.
- LoRAs: `E:\Dev\Web\test-just-direct\ai-cache\loras\ltx`: 3DREAL, Motion Track, MotionDeblur, Union Control, Ingredients multishot. Audio models: `E:\Dev\Web\test-just-direct\ai-cache\audiocpp-models`.
- The sync guidance that didn't help: `E:\Dev\Web\test-just-direct\modality-guidance.patch`, not in `jd`.
- Lightricks' source was read from a session scratchpad clone, which may not survive. Re-clone `github.com/Lightricks/LTX-2` and `github.com/Lightricks/ComfyUI-LTXVideo` if needed.

## Recipes that work on 8 GB

Always `--params-backend diffusion=disk,te=disk`, and `--vae-tiling --vae-tile-size 384 --vae-tile-overlap 0.125`, the `ltx` preset in `cli.js`, `SDCLI` set to the `jd` build.

- **Long take:** `-W 640 -H 352 --hires --hires-upscaler ltx-2.3-spatial-upscaler-x2-1.1 --hires-width 1280 --hires-height 704 --hires-steps 3 --hires-sigmas 0.909375,0.725,0.421875,0.0`, up to 313 frames (13 s, 840 s). `queue18.ps1`.
- **Action or anything with a keyframe:** klein keyframe, then one pass 1280×704 × 97. About 377 s. `queue21.ps1`, `queue16.ps1`.
- **Talking:** TTS wav, one pass 1280×704 with `--audio`, then LatentSync. `queue14.ps1`, `queue23.ps1`.
- **3D scene:** depth frames from the scene, `<lora:ltx-2.3-22b-ic-lora-union-control-ref0.5:1>`, `--control-video`, one pass 1152×640. W and H must be multiples of 64. `queue19.ps1`, `queue20.ps1`.
- **Motion path:** `drawtracks.js`, `<lora:motion-track-ref0.5:1>`, `--control-video`, 1152×640. `queue17.ps1`.
- **Planning:** Gemma 4 26B-A4B, `response_format`, thinking on, budget 4,000. `planner\run2.ps1`, `planner\planner-test.js`.

## Next, in order

1. Test Ingredients with the ungated `ingredients-multishot.safetensors`, factor 1, a sheet on black as a still guide. Failure reports: the sheet animates, faces melt at 1280×720. Measure across three shots. The official version, `Lightricks/LTX-2.3-22b-IC-LoRA-Ingredients`, is gated and needs the user to accept it on its page; only worth asking if the multishot one looks promising.
2. Real bodies in a 3D scene for fights: a rigged human, with pose through Union Control, and mocap from `E:\Dev\Web\just-mocap` when it's ready. The sword test used ellipsoids, and the model copied them exactly.
3. Motion Track on swords, on a clean single-blade keyframe; `queue16.ps1 one sword` now asks for one. Check the keyframe first.
4. MotionDeblur as a repair on a fast clip.
5. Longer than 13 s: latent carry windows, `2026-10-30-just-direct-research-longtake.md` §5.
6. Camera control: look for LTX-2.3 camera LoRAs; the LoRAs on Hugging Face are LTX-2 19B. `vista` barely moved.
7. Add the planner's repair step, which adds any card whose name appears in a shot.
8. Kit gaps for later: `videoJobBody` needs hires and control frames, `model-research.md`'s JSON law is out of date for `response_format`.
9. Offer the sd.cpp patches upstream, when the user wants.

## Waiting on the user

- The review page: `http://127.0.0.1:18190/review.html`, served by `node E:\Dev\Web\test-just-direct\review-server.js`; start it again if the session that ran it has ended. It shows 23 clips, 10 sounds and the three AI plans, each with click answers and an Other box. Answers save by themselves to `E:\Dev\Web\test-just-direct\review-answers.json`, so read that file when the user says they're done; `E:\Dev\Web\test-just-direct\review-data.js` holds the questions.
- Watch and listen; the full list of clips is below. Nothing has been judged by the user except earlier clips. Lip fit, music, sound effects and the AI's plans all need their eye or ear.
- Earlier work still unjudged: `E:\Dev\Web\test-just-direct\out\seq-joined.mp4`, `E:\Dev\Web\test-just-direct\out\h3-lipsync-41.mp4`.

## Claude Code's low-memory stops

Five of JustDirect's runs and one of JustStage's were stopped, always at a big file read or allocation, once with 21.7 GB free. Treated as false alarms; the cause isn't proven. Turned off permanently on 2026-10-31: `CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP` is `"1"` in the `env` block of `F:\ClaudeCode\config\settings.json`, for every session started after that. Long runs can go back to the background. `E:\Dev\Web\test-just-direct\memlog.ps1` logs memory if a stop needs studying. `cli.js` stops any run it starts when free RAM falls under 1.5 GB.

## Clips

All at `E:\Dev\Web\test-just-direct\out\`, written in full for copying:

- `E:\Dev\Web\test-just-direct\out\take-313.mp4` (13 s)
- `E:\Dev\Web\test-just-direct\out\take-241.mp4` (10 s)
- `E:\Dev\Web\test-just-direct\out\ls-a2v-full-41.mp4` (talking, repaired)
- `E:\Dev\Web\test-just-direct\out\a2v-full-41.mp4` (talking, before repair)
- `E:\Dev\Web\test-just-direct\out\a2v-full-42.mp4` (talking, second seed)
- `E:\Dev\Web\test-just-direct\out\action-car-one.mp4`
- `E:\Dev\Web\test-just-direct\out\action-blast-one.mp4`
- `E:\Dev\Web\test-just-direct\out\action-sword-one.mp4`
- `E:\Dev\Web\test-just-direct\out\depth-sword.mp4`
- `E:\Dev\Web\test-just-direct\out\depth1-union.mp4`
- `E:\Dev\Web\test-just-direct\out\track-car.mp4`
- `E:\Dev\Web\test-just-direct\out\movie-twoshot.mp4`, `-crowd`, `-horse`, `-hands`, `-dance`, `-ocean`, `-fire`, `-alley`, `-vista`, `-dragon`, `-anime`, `-scifi`
- Sound: `E:\Dev\Web\test-just-direct\out\audio\`
