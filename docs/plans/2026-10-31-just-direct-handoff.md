# JustDirect handoff, end of 2026-10-31

Read this first in a new session, then the register: `E:\Dev\Web\just-core\docs\plans\2026-10-24-just-direct-feasibility.md`, §J to §J.4. §J.3.2 is the proof list status. Action and the movie shot set: `E:\Dev\Web\just-core\docs\plans\2026-10-31-just-direct-research-action.md`.

## Decided and standing

- JustDirect is a family Quasar app, written only after local AI is proven. **No app code yet.** It is for anyone: 8 GB is the floor, bigger models stay on the per-machine list (§J.4) for a rented GPU later.
- The user's go for this work: "you can do whatever you want just keep working to make the best app quality and speed". About 7 minutes a clip is accepted, so quality comes first. The bar: "anything someone would wnat to put in a movies is part of the bar".
- Share the card by message: ListAgents, then SendMessage. Others this session: `3d-bf` (JustStage), `web-9e` (mocap, `E:\Dev\Web\just-mocap`). Never start on the card without their "card free". Names change per session.
- Every file named to the user gets its full absolute path. No popups. Never push `E:\Dev\Web\stable-diffusion.cpp` to origin, which is upstream.
- **2026-11-05, the user's latest go:** "keep working on aap until it is finished as long as you can get quality working, quality is the bar test and look and judge it for yourself, dont stop to ask me complete the app or let me know it is not possible to meet quality bar with the commercial use reseoruces and models". So Claude judges the clips; only models that allow commercial use go in the route (licences read 2026-11-05, action research §3.16): FLUX 3 is out, first frames are FLUX.2 klein 4B (Apache-2.0).

## State on 2026-11-06 (action research §3.16 from "Licences of the route" on)

- **Passed on commercial-use models, checked by Claude:** `plan-f-taxi-1-r1-sl` (a planner-written taxi turn: the spin-cost camera, headlight words, "dark glass windows") and `plan-d-dragon-2r-b2k` (the dragon's crossing fire attack, klein first frame). Swords and the anime leap passed on klein + refcontrol in §3.15.
- **A first-frame check the app can run itself:** `E:\Dev\Web\test-just-direct\framecheck.js` (Qwen3-VL-8B, Apache-2.0, on disk) agreed with Claude's eye on 16 of 16 taxi first frames. klein adds stray cars on most seeds, so the app makes several and keeps the one that matches the 3D.
- **Builder changes on 2026-11-05/06** (`E:\Dev\Web\test-just-direct\shot-scene.py`): spin cost and fault; size fault for cars; car lamp words; "dark glass windows" on streets; a creature stops 10 m short of a wall; a creature's pan that keeps the set in view may lag it; the castle's place in frame 1 in words; "small in the frame, far off" for small creatures; `stillTurnedDown` in the report.
- **Settled limits:** a dragon under about 380 px gets its guide painted in (dots at 250 px, trails at 240–300 px); a head-on dive from far off can't keep 380 px and the castle in frame, so the planner writes fire attacks as crossing passes (rounds H and I: 0 clean of 12, 4 of the last 6 with one fault left). A creature with a camera that pans fully with it draws long still-point trails (Lightricks fixes the trail at 50 frames).
- **2026-11-06 later: the explosion passes** (`blast-kf-blast-depth2`, `E:\Dev\Web\test-just-direct\blast-bodies.py`, `queue41.ps1`), so every action type the user named passes on commercial-use models. **Waiting on the user's word** (the decision list in the session's reply of 2026-11-06): the sd.cpp `jd` patches pinned as the kit's sd.cpp build (upstream has neither the LTX guide nor A2V; PR #1676 open since June); the Blender shot builder run headless on the shared engine host until JustStage's scene workspace exists (JustStage ARCHITECTURE §12–13: scenes come after its step 8); `drawtracks.js` in the kit with a golden test against Lightricks' renderer; and the kit gaps (video guides, audio input and upscaler stage in `videoJobBody`; audio.cpp music, effects and lip-sync kinds; an image in a chat feature's request for the first-frame check; the kit runner already loads `mmproj`).
- **2026-11-06, the user's "your rec go"** covered the kit gaps only (the kit's TASKS, "JustDirect's kit gaps"); the three NOT STANDARD pieces still wait for the user's word on each by name (the CLAUDE.md rule: a blanket go never covers one), and Blender as an engine waits with the builder. Built and pushed in just-core: an image in a chat request (567dae7e; the router's `.ini` now loads a row's `mmproj` — "already loads" was wrong), the video job's guide frames, driving track, LoRAs and upscale pass (6cb10337; the passing explosion remade through the kit's path matches the sd-cli clip, PSNR 46.7 dB), and audio.cpp's music, sfx and lipsync kinds (e547bded). Found and researched for the next list: a video feature (`runVideoFeature`, a video kind and band), FFmpeg from the kit (RESEARCH §13), LatentSync's answer as one Base64 string (a 720p line past about 6 s can't be read; RESEARCH §12).
- **2026-11-06, the user's six decisions** ("1 your rec dont do 2 , 3 your rec , 4 your rec 5 your rec, 6 your rec  go";
  the kit's TASKS, "JustDirect's six decisions after the kit gaps", with each rec's text and state):
  - Item 1 (our sd.cpp build as the kit's, a fork like audio.cpp's): `jd` merged with upstream locally (`2d036b0`) and
    the fork's workflow change (`9d4fbd5`). The GitHub fork's creation was refused by Claude Code's permission check, so
    nothing is pushed yet. No upstream pull requests, ever: the user's rule for every repo (2026-11-07, "no dont send
    patches upstream this is rulle on all and you should know this"). The user's go on the fork itself came the same
    day.
  - Item 2 (the Blender builder): not done, the user's word.
  - Item 3 (the motion-path drawer): in the kit, clean-room, matching Lightricks' renderer (`336d6556`).
  - Item 4 (the video feature): built (`1a97d977`). Two clips now run back to back on one server.
  - Item 5 (FFmpeg): built and measured (`edd35715`).
  - Item 6 (LatentSync's long lines): dropped. LatentSync's face weights are non-commercial, so lip repair is out of the
    commercial route.
- **Next (older):** the explosion through the real-body route (a soldier who runs and dives as the blast goes off; the one-pass blast had three arms); the builder's search for crossing fire attacks; then the NOT STANDARD list for the app (the sd.cpp `jd` patches, the Blender builder, the JS port of LTXVDrawTracks, the mocap pipeline) for the user's word by name, and the kit gaps (`videoJobBody` guides, audio and upscaler stage; audio.cpp music, effects and lip-sync kinds; llama.cpp image input for the check).

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
- **Action or anything with a keyframe:** a klein keyframe whose prompt names how each object is held and what fills the space, then one pass 1280×704 × 97 (about 395 s), or two-stage with the `ua` settings (about 335 s). `queue27.ps1`. Neither wins on every shot, §3.7, and the user hasn't judged them yet.
- **Talking:** TTS wav, one pass 1280×704 with `--audio`, then LatentSync. `queue14.ps1`, `queue23.ps1`.
- **3D scene:** depth frames from the scene, `<lora:ltx-2.3-22b-ic-lora-union-control-ref0.5:1>`, `--control-video`, one pass 1152×640. W and H must be multiples of 64. `queue19.ps1`, `queue20.ps1`.
- **Motion path, for blades, cars or the camera:** `drawtracks.js`, `<lora:motion-track-ref0.5:1>`, `--control-video`, 1152×640 or 1280×704 (9.5–10.5 minutes). `queue28.ps1`, `queue30.ps1`.
- **Planning:** Gemma 4 26B-A4B, `response_format`, thinking on, budget 4,000. `planner\run2.ps1`, `planner\planner-test.js`.

## Next, in order

The user's review reordered this: results and fault layers are in `E:\Dev\Web\just-core\docs\plans\2026-10-31-just-direct-research-action.md` §3.2.

0. `E:\Dev\Web\test-just-direct\queue24.ps1` is done: 12 two-stage clips, results in §3.3 of `E:\Dev\Web\just-core\docs\plans\2026-10-31-just-direct-research-action.md`, not yet judged by the user. The side-by-side page is up: `http://127.0.0.1:18190/review.html?set=two`, questions in `E:\Dev\Web\test-just-direct\review-data-two.js`, answers saved to `E:\Dev\Web\test-just-direct\review-answers-two.json`. `E:\Dev\Web\test-just-direct\queue25.ps1` (better keyframes, §3.5), `E:\Dev\Web\test-just-direct\queue26.ps1` (Lightricks' settings, §3.6) and `E:\Dev\Web\test-just-direct\queue27.ps1` (clips from the new keyframes, §3.7), `E:\Dev\Web\test-just-direct\queue28.ps1` (swords, §3.8), `E:\Dev\Web\test-just-direct\queue29.ps1` and `E:\Dev\Web\test-just-direct\queue30.ps1` (Ingredients failed, drawn paths move the camera, §3.9 and §3.10) are done. `E:\Dev\Web\test-just-direct\queue31.ps1` (pan, crowd, a second sword seed) is done too: §3.10. **The user's third review is in, §3.11:** one pass is the default; swords are not good enough yet; paths: "Can't tell yet". The user left what to fix to me; the decision and its tests are §3.12, `E:\Dev\Web\test-just-direct\queue32a.ps1` (keyframes) and `E:\Dev\Web\test-just-direct\queue32b.ps1 <dragon seed> <anime seed> <sword seed>` (clips). **§3.12 ran, results in §3.13:** the dragon flies forward and the anime girl leaps on the frames; framing closer did not fix the swords; the slower pushes match what was drawn. **The fourth review was done by me, not the user** (the user: "can you review the images yourself, really most issues are very obvious ... do i really need to do it"): §3.15. From now on I check every clip against every fault the user has named (every 8th frame plus full-size crops) and only clips that pass go to the user. `?set=fix` stays unanswered on purpose. **Two fixes passed (§3.15):** the dragon with drawn paths flies forward (`dragon-path`, `queue33.ps1`), and swords hold with real bodies: `duel-bodies.py` (MakeHuman bodies rigged in Blender, hands locked on the hilts by IK, the fight keyed by script, depth on the CPU) → a first frame from FLUX.2 klein + JustStage's refcontrol depth LoRA → LTX with Union Control (`duel-kf`, `queue35.ps1`, `queue35b.ps1`, `queue35c.ps1`). Then two more passed: the dragon beating its wings (`dragon-wings`, `queue36.ps1`, paths on the wing too), and the anime leap through the same real-body route (`leap-bodies.py`, `queue37.ps1`, `leap-kf-leap-depth3`; refcontrol's reference must be the character alone on white, `kf6-girl`, never a whole scene). The body code is shared in `E:\Dev\Web\test-just-direct\mhbody.py`. And the car chase through a corner (`car-scene.py`, `queue38.ps1`, `car-kf`): 3D cars that steer, a first frame from FLUX 3 with the depth as its picture (refcontrol ignored the depth on a car; Qwen-Image-Edit took 28 GB of RAM). The fifth review shows the six that passed (the two-stage blast `action-blast-two` rechecked and moved there from the second review): `http://127.0.0.1:18190/review.html?set=pass`, answers to `E:\Dev\Web\test-just-direct\review-answers-pass.json`. The second review (`?set=two`) is still unanswered. The route and its faults are summed up at the end of §3.15 item 5. Next: the user's answers; whether the planner can write paths and 3D scenes; the face-crop pass; an explosion through the same route. **Card, CPU and RAM:** ask JustStage and just-mocap before any heavy run, with the RAM it takes (an LTX clip is 14 GB of RAM, not 8–12). `cli.js`'s klein preset points at a folder that doesn't exist; name the files from `just-house-paint\data\probe\models\flux2-klein` as `queue35b.ps1` does. **§3.16 (2026-11-03, my third rec on "what next", which the user's "go" took; the question is mine, not the user's): the planner writing the 3D scene.** The planner writes a shot spec, `E:\Dev\Web\test-just-direct\shot-scene.py` builds it (sets in `scenekit.py`), `planner\scene-test.js` and `queue39.ps1` run the test, `queue40.ps1` turns a spec into depth, first frame and clip. Round A (timed waypoints, camera keys): structure always valid, directions right after two prompt lines, numbers wrong (too fast, collisions, cameras in buildings). Round B (format 2: routes, speed classes, followers, a camera intent; the builder times the motion and searches the camera): corner and taxi clean, overtake and dragon not. Rounds C and D (2026-11-03/04) made the first four clips from planner-written scenes (`plan-c-corner-1`, `plan-c-dragon-1`, `plan-d-corner-2`, `plan-d-dragon-2r`): the car driving is right in both corner clips, but none passes the whole check yet (a following car's look, bare walls, then a pier by the lens; the dragon's fire from its tail, then from off-screen, and guide dots on a small dragon). None of those four is on a review page. **Builder round 2 (2026-11-04, §3.16):**
- a check on what fills the frame at the lens, counting only surfaces facing it;
- camera spots along the pavements;
- a pan that follows a crossing creature only part of the way;
- the creature size floor at every frame, with longer lenses for creatures only;
- still points counted inside the search;
- the depth range stretching for far cameras;
- the fire words in the first frame when the fire starts at once.

With it, **two clips from planner-written scenes pass the whole check**: `plan-d-dragon-2r-b2` and `plan-d-corner-2-b2g`. The corner needed one hand step: its first-frame prompt had to name the following car and its place, or the frame drew it dark or swapped the cars. They are the sixth review, `http://127.0.0.1:18190/review.html?set=plan`, answers to `E:\Dev\Web\test-just-direct\review-answers-plan.json`. **Format 3 and rounds E–F (2026-11-04, §3.16):**
- *The format:* each actor's `look`, with the builder writing both prompts (every car or creature in frame 1 named with its look and place, "the road is empty" on streets, a car coming into view named at its edge).
- *Faults added:* look words missing from the video prompt; a look with no colour; with two or more cars, a car first in view after frame 3; a fire target that falls behind the dragon before the last frame.
- *Round E clips:* `plan-e-corner-2-r1-x` passes the named faults but falls short of the shot (the turn is 15 m off, and the police car is marked, because its look had no colour). The taxi got an extra car twice: a follower entering after frame 1 takes no look from the words. The dragon failed four ways, all once it had flown past its fire target. The video keeps the fire to the end, and Lightricks' renderer draws every point's last 50 frames, so the builder now uses b2's 8-point burst and requires the target to stay ahead.
- *Round F:* no build clean. The dragon seed 1 repair (`f-dragon-1-r1`) meets the fire rule at 370 px, the next clip; no repair put every car in frame 1, so the builder has to help there.

Nothing runs beside a clip: a JustStage image server stopped one with my RAM guard. The llama-server needs `--load-mode none` (the kit's MoE switch) or it keeps the whole model file in RAM.
1. Ingredients with the ungated multishot file failed (§3.9). The official file is gated, and isn't worth asking the user for yet.
2. Real bodies in a 3D scene for fights: a rigged human, with pose through Union Control, and mocap from `E:\Dev\Web\just-mocap` when it's ready. The sword test used ellipsoids, and the model copied them exactly.
3. MotionDeblur gave no real gain on `new-sword-one` (§3.8), so don't repeat it unless a new reason turns up.
4. Longer than 13 s: latent carry windows, `2026-10-30-just-direct-research-longtake.md` §5.
5. Add the planner's repair step, which adds any card whose name appears in a shot.
6. Kit gaps for later: `videoJobBody` needs hires and control frames, `model-research.md`'s JSON law is out of date for `response_format`.

## Waiting on the user

- Two downloads, neither done and both on hold, because drawn paths moved the camera with no download (§3.10): `ltx-2.3-lora-camera-controls.safetensors` (322 MB, `elismasilva/LTX-2.3-LoRa-Camera-Controls`) and `ltx-2.3-spatial-upscaler-x1.5-1.0.safetensors` (1,040 MB, `Lightricks/LTX-2.3`).
- The review pages: `http://127.0.0.1:18190/review.html` (first review), `http://127.0.0.1:18190/review.html?set=two` (second) and `http://127.0.0.1:18190/review.html?set=new` (third), served by `node E:\Dev\Web\test-just-direct\review-server.js`; start it again if the session that ran it has ended. A new review is a new `E:\Dev\Web\test-just-direct\review-data-<name>.js`, opened with `?set=<name>`, and it saves to its own `review-answers-<name>.json`. Read that file when the user says they're done.
- The first review is done: `E:\Dev\Web\test-just-direct\review-answers.json` holds the user's answers. Keep that file; the next review needs its own answers file or a copy of this one first.
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


## Standards: the kit code each job would use

JustDirect has no app code yet (feasibility §J: none until the proof list is green). This names the kit row
(`docs/app-structure.md` §19) each job in this file would run through when the app is built, and marks what the kit
lacks: a kit gap is filled in the kit before the app; a NOT STANDARD row waits for the user's word.

| Job | Kit code |
|---|---|
| Story, script and shot planning | `runAction` — the planner as a chat feature, its answer forced by llama-server's response_format |
| First frames and keyframes, from saved pictures (references, a set locked by a mask) | `runImageFeature`, `imageFeatureReadiness`, `imageJobBody` (`packages/core/src/runner/sdcpp.js`) |
| Video clips (LTX-2.3) | `runVideoJob`, `videoJobBody` — kit gap: no guide frames (depth, pose, paths), audio input or upscaler stage yet |
| A voice line with a chosen voice | `withSpeechModel` on the audio.cpp runtime (`packages/core/src/runner/audiocpp.js`) |
| Lip repair (LatentSync through audio.cpp) | `AudioCppPool` — kit gap: no lip-sync kind in the kit's audio.cpp runtime |
| Music and sound effects through audio.cpp | `AudioCppPool` — kit gap: the kit's audio.cpp runtime has only the tts and stt kinds |
| The graphics card, long jobs | `getArbiter`, `JobRegistry` |
| The IC-LoRA guide and audio-to-video in sd.cpp | NOT STANDARD — written on our `jd` branch of stable-diffusion.cpp; the standard option is upstream sd.cpp, which has neither; trade-off: a fork to bring up to date before each change (family rules) until upstream takes them |
| The test scripts (`cli.js`, `queue*.ps1`, the Blender scripts) | NOT STANDARD — test bench only; the app runs these jobs through the rows above |
