# Action and anything in a movie: research for JustDirect features 12 and 13

The user, 2026-10-31: "we need to be able to do quality action swords cars ect"; "anything someone would wnat to put in a movies is part of the bar".
Method labels: **code** read in the source, **card** from the model's card, **user** a user report, **measured-here** on this PC. Nothing below has been run on action yet.

## 1. The answer so far

1. **Users report LTX-2.3 as great quality, weak motion.** A May 2026 r/StableDiffusion thread: "Great quality, no motion"; the workaround is motion made elsewhere, then a video-to-video pass through LTX ("rendering low-res Wan clips then doing a V2V pass through LTX"). Others: Wan 2.2 depth into LTX, Union Control for pose, fight LoRAs, and cutting around the action. **user**, no settings given. Our 3D guide test is this same pattern, with Blender as the motion source.
2. **Half-size guides are the key engine feature.** Motion Track Control, Union Control and Lightricks' DFR detail pass all use a reference at half the output size (ref0.5). Our guide handles full size only. **code**
3. **Motion Track Control is the best find.** You give a video with coloured spline overlays for the paths things should follow, and the model follows them. For a car's path or a sword's arc this is direct control. Lines can be drawn by hand or tracked from a video, so in the app they could come from the user, the AI or a 3D scene. **card**
4. **DFR is Lightricks' "production quality" path, on our same distilled model.** Half-size stage 1 with extra generated keyframes, then a full-size pass with a detailing IC-LoRA, plus optional temporal rounds to 48 fps, which should help fast motion. Lightricks calls the one-pass pipeline "primarily for educational purposes", though it was what made lips follow audio here. **code, docs**
5. **Cloud leads on fights by the only sources found:** Seedance 2.0 and Kling 3, from a vendor guide that sells access to them, so biased. No head-to-head of fast action exists in what I searched. A gap in the search, not proof.

## 2. Candidates

| # | Method | What it gives action | Weights | sd.cpp needs | State |
|---|---|---|---|---|---|
| 1 | Motion Track Control IC-LoRA (Lightricks) | Exact paths for cars, swords, runners | 312 MB, ungated, community licence, ref0.5, modified 2026-10-22 | Half-size guide | Downloaded for test |
| 2 | Union Control IC-LoRA (Lightricks) | Pose, depth, edges from any motion source, including 3D | ref0.5, in the scene research | Half-size guide | Planned |
| 3 | Our guide + 3DREAL on a moving 3D scene | Exact shapes and paths from Blender or JustStage | On disk | Works today, factor 1 | Gray run proved motion and layout, look not yet |
| 4 | MotionDeblur IC-LoRA (`oumoumad`) | Clears fast-motion smear as a repair pass; heavy blur is "softened rather than fully eliminated" | 1,248 MB, ungated, community licence | Works today if factor 1, not stated on the card | Downloaded for test |
| 5 | DFR pipeline | Better detail, generated keyframes, up to 48 fps | Distilled on disk; detailing IC-LoRA 624 MB, `gated: auto`; temporal upsampler | Half-size guide, keyframe slots, temporal rounds. Large | Read, not planned yet |
| 6 | Motion Enhancer n4w (`rzgar`) | General motion strength; tuned on adult content, "general-purpose" by its card; 3 of 5 usable on full-body input | 2,167 MB, Apache-2.0 | None | Test on action |
| 7 | motion_stabilizer v2 (`vpakarinen`) | Smoother human motion | 643 MB, Apache-2.0; card says 15 to 30 steps, so may not suit distilled 8 steps | None | Lower priority |
| 8 | Wan 2.2 low-res, then LTX V2V | The users' workaround | Wan 2.2 14B needs heavy streaming here; FastWan 5B is in `cli.js` | Guide works today | To test once baselines exist |
| 9 | Go-with-the-Flow noise warping (Netflix, CVPR 2025) | Motion from optical flow, any model | Code and weights on GitHub, per the paper | Noise warp input. Unread | Read next |

## 3. Tests, in order

1. **Baseline, no new code (`queue16.ps1`):** sword duel, car chase, explosion. FLUX.2 klein keyframe, then LTX. Judge shape hold: blade, car body, hands.
2. Half-size guide in sd.cpp, then Motion Track Control on the worst of the three.
3. The motion source test: a fast 3D blockout with coloured props through the guide.
4. MotionDeblur as a repair on the best clip.
5. **Movie shot set:** dialogue close-up, two people talking, crowd, animals, hands at work, dance, water, fire, night exterior, wide landscape, a creature, stylized animation.

## 3.1 Movie shot set, first pass (*measured, 2026-10-31; `queue21.ps1`; viewed by Claude as frame sheets, not judged by the user*)

Each shot: a klein 4B keyframe (11–13 s), then LTX-2.3 distilled one pass, 1280×704 × 97 frames (4 s), `diffusion=disk,te=disk`. **377–389 s a clip, seed 11, every run clean.** Files: `out/movie-<name>.mp4`.

| Shot | How it looks | Weak point |
|---|---|---|
| `twoshot`, two people talking | Natural; faces and hands hold | Lip fit not checked |
| `crowd`, packed market | Very strong: hundreds of people stay coherent | Sign text is fake |
| `horse`, gallop on a beach | Strong: legs, spray, silhouette | The sun moves oddly behind the head |
| `hands`, chef chopping | Very strong: fingers correct, the carrot really slices | None seen in the sheet |
| `dance`, ballet leap | Strong | Slightly stiff |
| `ocean`, ship in a storm | Strong: rigging and lightning hold | The ship barely climbs the wave |
| `fire`, firefighter | Strong | The model cut to a new angle by itself |
| `alley`, rain and neon | Strong | Walks toward camera, not away; the keyframe decided that. Fake signs |
| `vista`, mountains | Beautiful | Almost no camera move, though a flight was asked for |
| `dragon`, over a castle | Beautiful, creature holds | Wrong action: fire from the wrong end, then it leaves frame |
| `anime`, rooftop run | Style holds completely | Stiff: the pose barely changes, then a sudden reframe |
| `scifi`, corridor and robot | Strong: suit, corridor and lights hold | The robot follows behind her instead of stepping out of a door |

**Pattern:** the look is strong across all of it, far ahead of what the keyframe alone would suggest. The weak side is control: exact actions, camera moves, and the model cutting by itself. That matches the users' "great quality, weak motion", and it is what guides and Motion Track address. Lightricks' camera-control LoRAs exist for LTX-2 19B; check for 2.3. Text in a shot is unreliable, so titles and signs need a post step.

## 3.2 The user's review (*2026-10-31, answers in `E:\Dev\Web\test-just-direct\review-answers.json`; this overrides the "viewed by Claude" notes above and in the register*)

Ratings are one clip each, seed 11 unless marked. Notes are the user's own words.

| Clip | Rating | The user's note |
|---|---|---|
| `take-241`, `take-313` | **Film ready**, both | 13 s can't be told from 10 s |
| `movie-twoshot`, `movie-horse` | **Film ready** | |
| `action-car-one` | **Film ready**, but "POLCE" is a deal breaker | The model's own cut: good |
| `movie-crowd`, `movie-scifi`, `depth1-union` | Good | |
| `movie-hands` | Good | "the carrot bended a little when it shouldnt but close" |
| `track-car` | Close, control useful | "it kind slides left instead of turning left" |
| `movie-dance` | Not good enough | "the face either has shodows or is blurry" |
| `movie-ocean` | Not good enough | "half the water is frozen while the one wave htis the ship" |
| `movie-fire` | Not good enough | "his hand never actually touched anything" |
| `movie-alley` | Not good enough | "umbrella is attached to should instead of him holding it" |
| `movie-vista` | Not good enough; no camera move is annoying | "not as realisitc as i would like the mountains look very similiar" |
| `movie-dragon` | Not good enough; wrong action is a deal breaker | |
| `movie-anime` | Not good enough; stiffness is a deal breaker | "three legs" |
| `action-sword-one` | Not good enough | "extra blades like one sticking from the right persons right sword" |
| `action-blast-one` | **Unusable** | "body has three arms after the explosion" |
| `depth-sword` | Not rated | Blades straight: yes. Cut and block: can't tell, "because it is stiff". "i dont know what i am comparing and what control you are talking about": the page failed to explain this section |

Movie set: 2 film ready, 3 good, 7 not good enough.

**Where each fault comes from, checked against the keyframes and frame sheets:**

| Layer | Faults | Evidence |
|---|---|---|
| Keyframe (FLUX.2 klein 4B) | Extra blades; umbrella with no hand; what looks like a third leg | `out/kf-sword.png` gives each fighter two blades despite "one single katana". `out/kf-alley.png` has both hands at his sides. `out/kf-anime.png` has a white sock behind the thigh that belongs to neither leg |
| Video, right after a cut the model made itself | Three arms (`blast`), "POLCE" (`car`) | The fault appears in the new shot, where the keyframe no longer holds anything in place |
| Video, weak motion | The picture holds nearly still for about half the clip, then jumps or cuts (`blast`, `sword`, `fire`, `anime`); frozen water; no camera move; fire from the tail | Frame sheets |

**Attack on my own recipe:** every clip above except the two long takes ran one pass at 1280×704. One pass won for lip movement only; I carried it to action and the movie set with no comparison, though Lightricks calls that pipeline "primarily for educational purposes" (section 1). No `action-*-two` clip exists. The only two-stage clips the user has judged are the long takes, both film ready, in a calm scene with no "no cuts" in the prompt. So two-stage is the first test. It may not help: `horse` and `twoshot` were film ready on one pass, and a calm café proves little about action.

**My earlier words were wrong:** "12 of 12 ran clean" meant the runs finished, and my frame-sheet notes ("strong", "the soldier dives and lands believably") missed faults the user found by watching. Three arms was called strong.

## 3.3 Two-stage against one pass (*measured and viewed by Claude, 2026-10-31, `queue24.ps1`; **not judged by the user yet**; one seed each, so a result for that clip only*)

Same keyframes, prompts and seed 11, 97 frames. Two-stage: 640×352, then the x2 upscaler and 3 refining steps to 1280×704. **329–343 s a clip** against 377–470 s for one pass, peak card 7,253 MiB, 8.8 GB or more RAM free. Files: `out/action-<shot>-two.mp4`, `out/movie-<shot>-two.mp4`.

"Change" is the mean frame-to-frame brightness difference per quarter of the clip, at 320 px wide. It shows where the picture moves. It says nothing about whether a body is right.

| Shot | One pass, change per quarter | Two-stage | What the frames show on two-stage (Claude's view) | Verdict on the frames |
|---|---|---|---|---|
| `blast` | 4.1 5.7 19.4 2.3 | 3.9 5.1 10.9 11.7 | One continuous shot, no cut. He runs, dives and lands. Two arms in all 9 close frames of the dive. Only one leg is visible at the end, the other hidden behind him | Better; the user's eye needed on the leg |
| `car` | 16.0 22.1 21.2 2.0 | 11.8 14.5 20.1 16.1 | No cut; the car turns and drives off. "POLCE" gone in the frames viewed, a badge on the door instead. New fault: the police cars face the camera, driving against the chase | Trade-off: the user rated one pass film ready |
| `fire` | 3.0 5.8 2.5 1.9 | 5.7 11.8 8.5 8.0 | No cut (one pass had a hard cut at frame 37). He reaches out to a door, then walks on with a flashlight. He doesn't kick it. His name tape is garbled | Better |
| `dance` | 1.0 1.2 2.3 1.6 | 0.7 1.7 1.8 1.8 | She really spins and leaps; the body holds. Her face turns away, so the face fault is mostly avoided, not fixed | Better |
| `anime` | 1.2 2.5 7.7 1.2 | 5.3 4.2 4.3 3.1 | She runs away, leaps and lands on the next building: the action asked for. She ends tiny, and the keyframe's stray sock is still there at the start. **Stutter, below** | Better motion, stutter |
| `ocean` | 1.1 1.0 5.3 2.6 | 6.0 5.2 7.0 5.0 | All the water moves from the start, and the ship climbs and crashes. At the end the masts smear as it's swamped. **Stutter, below** | Better motion, stutter |
| `sword` | 0.3 1.3 3.5 2.6 | 0.3 2.0 4.5 3.8 | They fight sooner, no cut. Still two blades each from the keyframe, and blades blur or vanish in the fast frames | Same fault; the keyframe comes first |
| `alley` | 1.6 1.5 1.6 1.6 | 1.1 1.9 2.8 1.6 | Still walks toward the camera. Both hands at his sides with the umbrella floating over him. He leaves the frame | Same fault; the keyframe decides it |
| `vista` | 0.8 0.9 0.9 0.8 | 1.5 1.5 1.3 1.3 | Still no flight, only clouds drifting | Same fault; needs camera control |
| `dragon` | 2.9 4.4 8.9 1.0 | 3.3 6.7 3.6 1.0 | Smoother, but the fire still comes from the tail and misses the castle, and the dragon leaves frame | Same deal breaker |
| `horse` | 1.1 1.1 1.1 1.0 | 3.4 3.8 3.7 4.1 | One pass barely moves: six frames across 1 s are almost the same pose, yet the user rated it film ready. Two-stage has real strides and a moving camera, but slows toward a walk, and the sun shines through his back | The user must choose |
| `hands` | 5.3 6.2 10.2 8.2 | 5.0 4.7 5.7 6.8 | **Worse:** the carrot splits into long halves instead of slices, and the chopping is lost | One pass wins |

**Stutter:** `movie-ocean-two` and `movie-anime-two` come in near-identical pairs of frames, so they move at about 12 fps. Odd steps against even steps: 10.06 to 1.55 and 7.10 to 1.35, a ratio of 6.5 and 5.3. All the others among the 80 mp4 and webm files measured are 1.31 or under, including the other ten two-stage clips. It's already in the raw `.webm`, so it comes from generation, not from our conversion. The cause isn't known. Hand-drawn anime is often animated on every second frame, so the model may be copying that, but that doesn't explain the ocean. Next: re-roll both on another seed, and read the upscaler path if it comes back.

**Hard cuts:** a check of one frame against its neighbours finds one hard cut, `movie-fire` at frame 37. `action-car-one` also cuts by eye, and that check misses it. My rough first figure, "6 of 12 jumped", was wrong: on one pass `blast`, `dragon` and `anime` lurch over several frames, and `ocean`'s spikes are lightning.

**So far, on the frames only:** two-stage is about 12% faster and fixes the "still for half the clip, then jump" fault on the shots that had it. It fixes none of the keyframe faults, nor camera moves or wrong actions, and it lost the chopping. So the app needs both recipes until the user's judgement says otherwise.

## 3.4 We weren't running the maker's recipe (*code, read 2026-10-31; tested in §3.6*)

Found while looking for the stutter's cause and for camera control. All the clips so far differ from Lightricks' own LTX-2.3 two-stage setup in ways nobody chose. Sources: `example_workflows/2.3/LTX-2.3_T2V_I2V_Two_Stage_Distilled.json` in [ComfyUI-LTXVideo](https://github.com/Lightricks/ComfyUI-LTXVideo), and `ltx_pipelines/utils/media_io/decode.py`, `utils/constants.py` and `distilled.py` in [LTX-2](https://github.com/Lightricks/LTX-2).

| Setting | Lightricks' workflow | Lightricks' Python | Ours | Can we test it now? |
|---|---|---|---|---|
| Re-compress the keyframe | H.264 CRF 18, stage 1 only | CRF 33 "through LTX-2.3", 18 from 2.4: "to match the compression the model was trained on" | **None:** a clean PNG; sd.cpp has no such step | Yes, ffmpeg before `-i` |
| Image strength, stage 1 | 0.7 | Set per image; docs example 1.0 | **0.75 by accident:** the `--strength` default (`common.h:220`, used at `video.cpp:937`); `cli.js` never set it | Yes, `--strength` |
| Image strength, stage 2 | 1.0 | Same as stage 1 | 1.0, fixed (`video.cpp:1629`) | No need |
| Stage 1 sampler | `euler_ancestral_cfg_pp` | Plain Euler before 2.5 (`ANCESTRAL_SAMPLER_SINCE_VERSION = (2, 5)`) | Euler | Partly: `euler_a` exists, but `video.cpp:2047` uses the same sampler for both stages |
| Stage 2 sampler | `euler_cfg_pp` | Euler | Euler | No need |
| Stage 2 sigmas | **0.85**, 0.725, 0.4219, 0 | 0.909375, 0.725, 0.421875, 0 | The Python values | Yes, `--hires-sigmas` |
| Stage 1 size | 960×544 | 768×512 default, half the output | 640×352 | Larger needs the x1.5 upscaler, or 768×416 to 1536×832 with the x2 |
| Image resize | Longer side to 1536, lanczos | Resized per stage | Keyframe is 1280×704 | No |
| Model | Dev with the distilled LoRA at 0.5 | Distilled | Full distilled Q4_K_M | Not on 8 GB without new files |

The two Lightricks sources disagree on CRF, sampler and stage 2 sigmas, so both are worth testing. Any of this may help or do nothing: that the maker uses it doesn't prove it on our clips.

**Why it may matter:** the compression step exists because the model trained on compressed video, so a clean still may not read to it as the start of a video. That's my reasoning, not a stated finding. A smaller stage 1 may be why the small carrot slices were lost: `hands` is the only shot that got clearly worse.

**The stutter's cause is still open:** the decoder's upsample block repeats its input across the two output frames of each temporal step (`DepthToSpaceUpsample`, `ltx_vae.hpp:400`), so paired frames are a natural failure of that design, but that doesn't explain why only two clips show it. Searches found no report of this on LTX: a gap in the search, not proof it's rare.

**Camera control:**
- [`elismasilva/LTX-2.3-LoRa-Camera-Controls`](https://huggingface.co/elismasilva/LTX-2.3-LoRa-Camera-Controls): 322 MB, phrases such as "the camera pans to the left"; the author intends it for non-commercial use. Not on disk.
- [`Cseti/LTX2.3-22B_IC-LoRA-Cameraman_v2`](https://huggingface.co/Cseti/LTX2.3-22B_IC-LoRA-Cameraman_v2): copies a camera move from a reference clip; the author says not for commercial use, not below 960×512 for the first pass, and image strength "0.5 or 0.7 for more motion". Not on disk.
- [LTX's prompting guide](https://docs.ltx.io/open-source-model/usage-guides/prompting-guide): "Describing how subjects appear *after* the movement helps the model complete the motion accurately." A [Runware guide for LTX-2.5 Pro](https://runware.ai/docs/models/lightricks-ltx-2-5-pro/guides/camera-movement.md) says a move "completes more reliably when it has a target". My `vista` prompt had no end point, so that's the first thing to try, and it costs nothing.

## 3.5 Better keyframes (*measured and viewed by Claude, 2026-10-31, `queue25.ps1`; the user hasn't seen them; no clip made from them yet*)

Six seeds each, 10–12 s a picture. Prompts now name the hand, the object and the body. FLUX.2 klein has no negative prompt, so each one says what should be there rather than what shouldn't: "Their belts are empty", "one foot on the ground and the other leg stretched behind her", "the first flames pouring from its mouth, its tail trailing far behind it".

| Shot | Result across six seeds | Pick | Files |
|---|---|---|---|
| `sword` | **Fixed:** one blade per man in all 6, against two each before. Some keep a long hilt or scabbard at the belt | Seed 13, full bodies with room to fight; seed 14 is closer | `out/kf2-sword-<seed>.png` |
| `anime` | **Fixed:** two clean legs in all 6. The pose reads more as a long stride than a run. Seed 16 has a doubled fist | Seed 13 | `out/kf2-anime-<seed>.png` |
| `dragon` | **Fixed:** fire from the mouth in all 6, tail well away from it. Fire in the first frame may stop the "sweeps down, then breathes" beat, so that prompt needs changing | Seed 15, fire on the battlements | `out/kf2-dragon-<seed>.png` |
| `alley` | **Better, not solved:** he walks away and an arm is raised in all 6, but in none does the shaft run from his hand to the canopy; hands sit at the rim or by a loose hook | See `kf3` below | `out/kf2-alley-<seed>.png` |

So the extra blades, the third leg and the fire from the tail were largely prompt faults in the picture. I had asked for a single blade before and it failed, but naming what fills the space did work. That's from these four shots only.

`kf3-alley` retry, same six seeds: "He carries an open black umbrella: his right fist at shoulder height grips the handle, and the straight shaft runs from his fist up to the center of the umbrella above his head. His left arm hangs at his side."

**Fixed on the zoomed frame:** in `out/kf3-alley-11.png` his fist grips the shaft by his shoulder and the shaft runs straight up to the canopy, with the other arm down. **Pick: seed 11.** In seeds 13 and 14 the shaft passes behind his head. The lesson is the same as `sword`: spell out how the object is held, and the arm follows. Whether the grip survives motion isn't known until a clip is made from it.

## 3.6 The maker's settings, tested (*measured and viewed by Claude, 2026-10-31, `queue26.ps1`; **not judged by the user**; 3 shots, one seed each except `s12`*)

All 12 clips finished: 331–342 s, and 433 s for `big`. Keyframe, prompt and seed as `movie-<shot>-two`, except where the run says otherwise. Files: `out/movie-<shot>-<run>.mp4`.

| Run | What it changes | Stutter, `ocean` | First-frame edges: `ocean`, `vista`, `hands` |
|---|---|---|---|
| `two` | Baseline: clean keyframe, strength 0.75, Euler | **6.48** | 43.7, 42.5, 19.8 |
| `py` | Lightricks' Python: CRF 33, strength 0.7 | 1.10 | **31.6, 34.2, 16.2** |
| `ui` | Their workflow: CRF 18, strength 0.7, stage 2 from 0.85 | **5.05** | 40.4, 41.1, 18.4 |
| `ua` | `ui` plus the ancestral sampler, on both stages | 1.51 | 40.9, 41.2, 18.2 |
| `s12` | Baseline with seed 12 | 1.21 | 43.9 (`ocean` only) |

"Edges" is the mean Sobel edge strength of the first frame at 1280×704, higher being sharper, and only comparable within one shot. Stutter is the odd and even step ratio from §3.3; `vista` and `hands` stayed at 1.34 or under on every run.

**CRF 33 blurs the clip: dropped.** First-frame edges fall 28%, 20% and 18% on the three shots, clip size falls about 40% on `ocean` and `vista`, and zoomed crops show soft rigging and trees. The likely cause is that our `-i` image goes to both stages and stage 2 holds it at strength 1.0 (`video.cpp:1629`), which stamps the compression into the clip. Lightricks' workflow compresses for stage 1 only. Trying it that way needs an engine change. CRF 18 costs 3–8%.

**The stutter isn't one setting.** The same settings on another seed lose it (`s12`), `ui` keeps it, and `ua` and `py` lose it. Where it occurs, it runs the whole clip: 3.9–9.5 per 16-frame window on `two`, 3.2–9.5 on `ui`, 1.3–2.0 on `ua`, so `ua` still has a little. The cause is still open. `queue27.ps1` runs stage 1 alone with the `two` settings to show which stage makes it.

**`vista`: the camera still doesn't fly.** All five runs, including `end`, the prompt with an end point, leave the peak the same size in the frame; only the clouds drift. So a prompt doesn't fix it, and a camera LoRA is the next thing to try (§3.4). That download needs the user's yes.

**`hands`: nothing beats one pass, which the user rated Good.**
- `py` and `ui`: the carrot still splits into long halves.
- `ua`: round slices appear beside a carrot the knife never cuts through, so it looks like slices but isn't chopping.
- `big`, 768×416 to 1536×832: the knife does take a strip off, and more happens, but there's no chopping rhythm and the left hand crosses over the right arm once. It took 433 s; its peak card use wasn't captured, because `queue26.ps1` cut the result line short.

**`ocean` by eye:** `py` swamps the ship in a huge wave, but soft. `ua` is sharp, and the ship heels over with spray rising, though by the end it's capsizing with its masts at odd angles. `s12` makes one big move early, then the ship sits still among waves like dark cloth.

**Decision for now:** `ua` is the two-stage setting for the next test, being the only run that lost most of the stutter while staying sharp. The evidence is thin, because a seed change moved `ocean` as much as any setting did. That the maker uses a setting proved nothing here: their CRF 33 made our clips worse.

## 3.7 Clips from the new keyframes (*measured and viewed by Claude, 2026-11-01, `queue27.ps1`; **not judged by the user**; one seed each*)

`ua` is the §3.6 settings, 333–384 s, peak card 7,253 MiB, 7.75 GB or more RAM free. `one` is one pass 1280×704 from the clean keyframe, the recipe the user reviewed, 394–398 s, peak card 7,104 MiB, 9.96 GB or more free. Files: `out/new-<shot>-ua.mp4`, `out/new-<shot>-one.mp4`. The prompts were rewritten as well as the keyframes, so the gain can't be credited to the keyframes alone.

| Shot | The user's fault on the old clip | `one` | `ua` | Better on the frames |
|---|---|---|---|---|
| `sword` | Extra blades | One blade each at the start, clear overhead swings, sparks at the clash, and he leaps at the end. The black samurai's blade vanishes in some frames, and the red one's goes stiff like a pole | One blade each at the start. Mid-clip, blades and hands tangle: at frame 50 the red samurai's hand seems to hold the black one's blade. No sparks | `one` |
| `alley` | Umbrella nobody held; walked toward the camera | His back stays to the camera, and his fist stays on the shaft in all three zoomed frames. A clear cat crosses the wet street | His back stays to the camera, and the shaft is held at frame 24; the later crops miss the hand. Blurred animals stand in the background, and nothing crosses his path | `one` |
| `dragon` | Fire from the tail, missing the castle | Fire from the mouth hits the battlements, then the dragon flies out of frame | Fire from the mouth hits the wall and burns on it, then the dragon flies off and shrinks. The wings warp mid-clip | About even |
| `anime` | Three legs, stiff | Two legs, but she runs on the spot while the city scrolls, with no leap, and one frame has a smudged knee | Two legs. She reaches the ledge and leaps, and she's still in the air at the end, so she doesn't land | `ua` |

**So on the frames viewed, the user's four deal breakers on these shots are gone.** That's not a pass: the blast's three arms also got past my frame sheets, and fast blades are where that's most likely. `sword` still loses and regains blades. Neither way wins on all four, so "pick per shot" stands.

**The stutter comes from stage 1.** Stage 1 alone, at 640×352 with the `two` settings, already has it: `movie-ocean-s1` 5.76 and `movie-anime-s1` 4.39, against 6.48 and 5.27 for the full clips. So stage 2 only carries it on. That fits one pass at 1280×704, which has never shown it: all 4 `one` clips here are 1.02 or under. Why the small size makes paired frames on some clips isn't known.

**`ua` reduces it, but doesn't clear it.** Three `ua` clips are at 1.00. `new-anime-ua` is 1.48, starting at 1.9 and easing to 1.2, and `movie-ocean-ua` is 1.51. Those are the two shots that stuttered before, so the user's eye has to say whether 1.5 shows. It's also not known whether the sampler matters most at stage 1, which would fit this result. Testing that needs an engine change, because `video.cpp:2047` uses one sampler for both stages.

**User's review:** `http://127.0.0.1:18190/review.html?set=new`, questions in `E:\Dev\Web\test-just-direct\review-data-new.js`, answers in `E:\Dev\Web\test-just-direct\review-answers-new.json`. The page also compares `movie-ocean` with `movie-ocean-ua`, and `movie-hands` with `movie-hands-big`.

## 3.8 Three ways at the sword fight (*measured and viewed by Claude, 2026-11-01, `queue28.ps1`; **not judged by the user***)

All from `out/kf2-sword-13.png`, aimed at the blades that come and go in `new-sword-one`.

| Run | What it is | Time, peak card | On the frames |
|---|---|---|---|
| `new-sword-track` | One pass 1152×640 with Motion Track: four drawn paths, both blade tips and both pairs of hands (`tracks-sword.json`) | 568 s, 6,952 MiB | **The best fight so far.** The black samurai raises his sword overhead as drawn and lunges, the red one meets it, and sparks burst at the point of contact. Blades stay solid in the close frames viewed. The low slash and the leap in the prompt don't happen, and a blade shortens in a few frames |
| `new-sword-s12` | One pass, seed 12 | 409 s, 7,214 MiB | One blade each. They lock and push, then the red samurai is thrown to the ground. Reads as a fight, but it's not what was asked, and there are no sparks |
| `new-sword-s13` | One pass, seed 13 | 408 s, 7,218 MiB | One blade each. Blades streak to white blur in the swings, and he leaps straight up. No sparks |
| `new-sword-deblur-1152` | MotionDeblur repair of `new-sword-one`, its frames as the guide | 793 s, 6,994 MiB | **No real gain:** edge strength moves 0–2% across the clip, and the blurred blades and faces stay blurred. Hands are slightly crisper in one frame. Not worth 13 minutes |

**So drawn paths are the first thing that has directed a fight on this card.** Text alone gave three different fights from three seeds, none of them the one asked for. Four paths gave the raised sword, the lunge and the clash, in order. That matches the `track-car` result, and it points the app at paths drawn by the user, the AI or a 3D scene, rather than at better wording. One clip, one seed.

**All three seeds kept one blade each**, so the `kf2-sword-13` fix holds across seeds on the frames viewed.

**A full-size guide fits:** factor 1 at 1152×640 ran at 6,994 MiB, where I'd expected it to run out of memory. So a repair pass that needs the whole clip as a guide can run on 8 GB, at 13 minutes a clip.

## 3.9 Ingredients, first test (*measured and viewed by Claude, 2026-11-01, `queue29.ps1`; multishot fine-tune, not the official file*)

Sheet: `out/sheet-cast/0001.png`, 1456×825, face, seated body and notebook on top, the empty cafe below, on black. No keyframe. 960 of 960 LoRA tensors applied.

| Run | Size | Time, peak card | Result |
|---|---|---|---|
| `ing-wire` | 512×288 × 49, one stage, LoRA 1.0 | 270 s, 6,968 MiB | **Failed the gate:** the sheet's panels and black bars are in the clip |
| `ing-10` | 640×352 to 1280×704 × 121, LoRA 1.0 | 554 s, 7,198 MiB | **Failed:** the clip is the sheet, gently animated, with no scene |
| `ing-14` | Same, LoRA 1.4 | 553 s, 7,198 MiB | **Failed:** same |

This is the reported failure, "the sheet animates itself", and it fits on 8 GB, so memory isn't the block.

**My test differed from the official graph,** `LTX-2.3_ICLoRA_Ingredients_Single_Stage_Distilled.json`, which I should have read before running it:
- Its prompt has a `### Reference Sheet Description` section with a `**Top Row Left (Character):**` entry per panel, then a `### Target Description` section. I used the card's `Reference sheet:` and `Generated video:` shape.
- It uses the official file on the dev model with the distilled LoRA at 0.5, at 960×544. I used the multishot fine-tune on the distilled model.
- Guide: frame 0, strength 1, factor 1, the sheet repeated for every frame, short side 544. Ours matches that.

**Retried with the official prompt format (`queue30.ps1`), 640×352 × 49, 288 s each: failed again.** `ing-fmt` is the sheet from the first frame. `ing-kf`, with `-i out/seq1.png`, starts on the keyframe, then the clip jumps to the sheet by frame 12. **So the multishot file is out.** The official file might behave differently, but it's gated and the keyframe route already works (§J.3.2 row 4), so it's not worth asking the user for now. Whether the copying comes from this file or from our guide code isn't known. Motion Track and Union Control don't copy their guides on the same code.

## 3.10 Drawn paths move the camera (*measured and viewed by Claude, 2026-11-01, `queue30.ps1`; **not judged by the user***)

**`vista-track` gives the mountain shot the camera move that no prompt could.** It's one pass, 1152×640 × 97, 550 s, peak card 6,990 MiB, with Motion Track and ten points spreading out from the peak (`tracks-vista.js`), the way the scene moves when a camera flies forward. In zoomed crops the peak really grows, about 1.5× by eye against the 1.7× drawn, and the near ridge and clouds slide out of the bottom of the frame. The mountains keep their shape. Frame-to-frame change is 3.9, against 0.8 on `movie-vista`, with no stutter (1.02). Edge strength is 2–11% lower than `movie-vista`, so the picture softens a little.

This is my own use of the LoRA, not one Lightricks describes, and it's one shot. If pans and moves on scenes with people work too, the app could draw camera moves as paths, and the camera LoRAs in §3.4 aren't needed. So those downloads, and the x1.5 upscaler, can wait.

**`new-sword-track-720`: the sword paths at full size fit.** 1280×704 × 97, 631 s, peak card 6,876 MiB, so Motion Track doesn't have to run smaller than the other clips. Blades are sharp and solid in the close frames, and the low slash now happens. But the sparks are gone, the fight is tamer, and in frames 65–85 what looks like a third blade appears near the black samurai's hip. So the same paths and seed at another size gave a different fight, and a seed can still add a blade. This is why the user's eye comes before any claim on swords.

**More moves, `queue31.ps1`, all 1280×704 × 97, about 630 s, peak card 6,876 MiB or under:**

| Clip | What the paths ask for | On the frames | Measured |
|---|---|---|---|
| `vista-pan` | Every point slides left by 35% of the width, so the camera pans right | **A real pan.** The peak slides left by about 32% of the width, and new peaks, clouds and the sun come in from the right | Change 6.9 against 0.8, edges within 3% of `movie-vista`, stutter 1.07 |
| `crowd-track` | Points spread out from the middle of the street, for a push through the market | **A real push.** Signs and people grow toward the camera, faces hold, and people keep moving. Signs are still garbled, as they are in the keyframe | Change 5.3 against 1.2, edges within 3% of `movie-crowd`, stutter 1.06 |
| `new-sword-track-720-s12` | The sword paths, seed 12 | **The cleanest fight so far.** A diagonal cut meets a parry with sparks at the contact, then one blade drops low and the other rises. One solid blade each in all the close frames viewed | Stutter 1.00 |

**So paths have now given a push, a pan and a push through people, all at full size,** with no extra download and no visible loss of sharpness. They also keep the stutter away, since they run in one pass. The cost is 10.5 minutes a clip against 6.6, and the clips have no special handling for what comes in from the frame edge: the model invents it. Pans and pushes only so far, each on one shot and one seed.

**What this means for the app, if the user agrees after review:** camera moves and fight beats become paths. The app can draw simple camera paths itself from a button such as "push in" or "pan right" with `tracks-vista.js`'s method. A fight's paths can come from the user, from the AI planner or from a 3D scene. Whether the planner can write good paths isn't tested yet.

## 3.11 The user's third review (*2026-11-02, answers in `E:\Dev\Web\test-just-direct\review-answers-new.json`; this overrides the "viewed by Claude" notes in §3.7, §3.8 and §3.10*)

`one` is one pass at 1280×704; `ua` is two-stage with the §3.6 settings. The notes are the user's own words.

| Comparison, left against right | Left | Right | Better | What the user found |
|---|---|---|---|---|
| `new-sword`: `one`, `ua` | **Good** | Not good enough | Left clearly | Only the left keeps one sword each. "left swords bends a little at start" |
| `new-alley`: `one`, `ua` | **Good** | Not good enough | Left clearly | Both hold the umbrella, walk away and have a cat cross. "right had dup cats both where walking aways instead of torwards the camera" |
| `new-dragon`: `one`, `ua` | Close | Close | Left a little | Both breathe fire from the mouth onto the castle, body and wings right. "both run in reverse" |
| `new-anime`: `one`, `ua` | **Good** | Not good enough | Left clearly | Legs right on both; a real leap on neither. "the end for both is wring they arent leaping correctl more like walking in air" |
| `sword-track`: `new-sword-one`, `new-sword-track-720-s12` | Not good enough | Not good enough | Right a little | One solid blade each on the right only; its sparks land where the blades meet. "both swords bend, right hands get a little off after 1st swing" |
| `sword-track-720`: `new-sword-track`, `new-sword-track-720` | Not good enough | Not good enough | Can't tell | Neither keeps one sword each. "multiple sword fragments" |
| `vista-track`: `movie-vista`, `vista-track` | Close | Not good enough | Left clearly | The camera really moves, the mountains keep their shape. "right camer moves reall;y fast forward makes the shot wrong" |
| `vista-pan`: `movie-vista`, `vista-pan` | Good | Close | Can't tell | Pan, new mountains and sun: "Mostly" each |
| `crowd-track`: `movie-crowd`, `crowd-track` | Good | Close | Left a little | Camera moves: yes. People move naturally: mostly. **Faces hold up: no** |
| `ocean-again`: `movie-ocean`, `movie-ocean-ua` | Not good enough | **Close** | Right clearly | `ua` smooth, all the water moves, the ship mostly holds. "left water stuck again, right all water moves, it loooks like ship will turn over at the end" |
| `hands-again`: `movie-hands`, `movie-hands-big` | **Good** | Close | Left clearly | Both slice, hands right on both. "right clip only did 1 chop" |

The user's overall answers: the default is **full size in one pass**; swords are **not** good enough to stop working on; drawn paths at 10.5 minutes a clip: **"Can't tell yet"**; what to fix first: "you think on what to fix".

**What it settles:**
- **One pass is the default.** It won 6 of the 7 comparisons against `ua`. `ua` won only `ocean`, where one pass leaves half the water frozen, so it stays as a per-shot choice for scenes where everything has to move. That's one shot of evidence.
- **The keyframe fix worked:** three of the four shots that failed the first review are now Good on one pass, and the fourth is Close. Extra blades, the unheld umbrella, the third leg and the fire from the tail are all gone.
- **Paths aren't proven to the user yet.** The push I drew, 1.7× in 4 s, is too fast. The pan looks no better than no move. The faces fail in the push through the crowd, and the paths make the sword fight only a little better.
- **My frame views missed faults again:** I wrote "faces hold" on `crowd-track`. A rating also moves with what it sits beside: `new-sword-one` was Good next to `new-sword-ua` and Not good enough next to the paths clip, and `movie-vista` was Close in one comparison and Good in the next. So a choice between two ways needs both side by side.

**Faults left, by kind, on the best judged version of each shot:**

| Kind | Shots | The layer it comes from, checked on the frames |
|---|---|---|
| Wrong direction or action | `new-dragon`: it faces the castle and breathes on it, but drifts backwards, tail first, out of the left of the frame. `new-anime`: she runs on the spot while the city scrolls, then the roof ends under her and she runs on in the air. Earlier: `movie-fire`'s hand never touches, `track-car` slides | Keyframe and prompt. The dragon's keyframe has the tower right in front of its head and no space ahead, and the prompt gives no direction. The anime keyframe is a side view of a run with no gap in sight, so a leap has nowhere to start |
| Thin, fast objects | Swords bend, break into fragments, and hands slip after the first swing, with or without paths | The model. In this wide shot a blade is a few pixels wide, and each cell the model works in covers 32×32 pixels and 8 frames, so a fast blade is far finer than one cell |
| Small faces in motion | `crowd-track` faces; `movie-dance` "shodows or is blurry" (first review) | Same scale limit. The face-crop pass in `2026-10-30-just-direct-research-talking.md` (track, crop, regenerate the face to fill the frame, paste back) is researched and never built |
| Camera moves | The push too fast | My path setting |
| Not judged yet | Two-stage `blast`, `car`, `fire`, `dance`, `horse` in the second review | — |

**Higher frame rate isn't a cheap fix:** Lightricks' own notes (`packages/ltx-pipelines/CLAUDE.md` in LTX-2) say a 48 fps time base is outside the trained range and "decodes as a motion spike at each 8-frame latent border followed by a stall". Their pipelines map high rates to 60 (`dfr_stages.py`) or 30 (`hdr_ic_lora.py`), so the range isn't clear and I haven't tested it.

## 3.12 What to fix first (*decided 2026-11-02; the user: "you think on what to fix"; `queue32a.ps1` keyframes, `queue32b.ps1` clips, all one pass*)

1. **Wrong direction and action, at the keyframe and prompt:** `dragon-fix` puts open sky ahead of the dragon's head and has the prompt say it flies left to right, head first, and how the shot ends. `anime-fix` puts the edge and the gap in the keyframe, and the prompt describes the push-off, the arc and the landing in a crouch. These go first because they're cheap and because this layer already fixed three of the user's deal breakers. *Attack:* a prompt with an end point didn't move the camera (§3.6), so words may not move a body either. If they fail, the next step is a drawn path for the body.
2. **Swords, by framing:** `sword-mid-11` and `sword-mid-12` are the same duel and the same words as `new-sword-one`, but from the waist up, so a blade is several cells long and wide. *Attack:* a closer shot also moves each blade more pixels per frame, which may smear it more, and a wide fight shot is still part of the bar. If the closer shot holds, the planner frames sword fights closer, and wide shots wait for a crop pass.
3. **Camera paths at a gentle speed:** `vista-slow` at 1.25× and `crowd-slow` at 1.2×, both 1280×704, against the 1.7× and 1.5× the user saw. Without a natural speed, the question "are paths worth 10.5 minutes?" can't be answered. *Attack:* `vista-track` ran at 1152×640, so the size changes too; 1280×704 matches every other clip, and the user didn't fault the picture.

Not this round: the face-crop pass, which is a bigger build, and higher frame rates, which aren't understood yet.

## 3.13 The fixes, tested (*measured and viewed by Claude, 2026-11-02, `queue32a.ps1`, `queue32b.ps1`; **not judged by the user**; one seed each except the swords*)

Keyframes `kf4-dragon-14`, `kf4-anime-14` and `kf4-sword-16`, picked from six seeds each. Twelve of the 18 stills first stopped on the RAM guard or the full card: a stray JustStage image server (8.7 GB) and a JustMocap CPU job (7 GB) were running. Both ended and the stills were re-run. Clips: 400–431 s one pass, 631–634 s with paths; peak card 7,345 MiB; 8.19 GB or more RAM free. Files: `out/<label>.mp4`.

| Clip | On the frames | Change per quarter | Against |
|---|---|---|---|
| `dragon-fix` | **Flies forward now, head first, left to right.** It breathes on the tower, passes over it and flies on into the sky to the right, fire still from the mouth, while the camera turns to follow and the castle burns below. Mid-clip, around frames 36–60, its body and wings twist into odd poses | 2.8 6.1 10.0 7.3 | `new-dragon-one` drifted backwards: 2.4 4.1 7.0 3.8 |
| `anime-fix` | **A real leap.** She runs to the edge, jumps, is in the air over the gap, and lands on the lower roof, then crouches there. She's small at the end. The first second barely moves | 1.0 9.9 7.1 0.3 | `new-anime-one` ran on the spot: 3.1 3.1 3.1 2.7 |
| `sword-mid-11` | **Not fixed.** Nearly still for the first quarter, then a swing in which the blades blur and break into fragments around frame 72 | 0.4 1.9 7.9 8.9 | `new-sword-one`: 0.3 2.3 5.3 4.4 |
| `sword-mid-12` | **Not fixed.** From about frame 40 to 64 the black samurai holds a second blade pointing back past his body. It ends on a fast camera swing | 1.2 4.9 4.0 11.9 | |
| `vista-slow` | A steady push: the peak grows about 1.25× over the clip, as drawn | 2.2 2.1 2.0 1.9 | `vista-track` 4.4 4.0 3.6 3.6; `movie-vista` 0.8 |
| `crowd-slow` | A steady push, about 1.2×. Faces look right in still frames, but the user judges faces by watching, and they failed in `crowd-track` | 2.4 2.5 2.5 2.6 | `crowd-track` 4.8 5.1 5.5 5.8; `movie-crowd` 1.2 |

No hard cuts: the largest frame-to-frame change score in any of the six is 0.04, against 0.50 for the known cut in `movie-fire`. Stutter 1.01–1.07 on all six.

**So, on the frames only:** the direction and the leap were keyframe-and-prompt faults, and stating where the move goes and how it ends fixed both. That repeats §3.5's lesson for motion: give the move room in the picture and say how it ends. **Framing closer didn't fix the swords**: both medium shots still break up or add a blade, so the "blade thinner than a cell" idea isn't supported. Swords need a different approach: real bodies and blades from a 3D scene kept the blades straight in `depth-sword` (user: "at least swords are straight and not bending"), which makes that the lead.

**User's review:** `http://127.0.0.1:18190/review.html?set=fix`, questions in `E:\Dev\Web\test-just-direct\review-data-fix.js`, answers to `E:\Dev\Web\test-just-direct\review-answers-fix.json`.

## 3.14 Swords next: real bodies in a 3D scene (*coverage and research, 2026-11-02; nothing built yet; waits for the fourth review, which asks the user what to fix next*)

**What we already have:**
- **Depth from a 3D scene keeps blades straight.** It's the only thing the user has said that about: `depth-sword`, "at least swords are straight and not bending" (§3.2). The fault was stiff motion from ellipsoid bodies, which the model copied exactly. Made by `E:\Dev\Web\test-just-direct\blockout-sword.py` in Blender 5.3 beta (`E:\blender-5.3.0-beta\blender.exe`), with Union Control.
- **A free human body with a skeleton is already on disk:** JustStage's fetched MakeHuman data, `E:\Dev\3D\just-stage\extension\juststage\data\fetched\makehuman\`. It has `3dobjs\base.obj` (the base mesh), `rigs\standard\rig.game_engine.json` and `weights.game_engine.json` (the skeleton and its skin weights), and targets. Its `LICENSE.md` says the assets, including "The base mesh and proxies" and "Rigs, poses and expressions", are CC0 1.0. MPFB's own code is GPLv3, so we write our own loader.
- **Mocap from video** is measured on this card (SAM 3D Body, mocap research), and route A there is "Mocap on a rigged character, render, then guide LTX".

**What the searches found** (query log in section 4):
- No sword-specific method or workflow anywhere. OpenAI says Sora 2 "struggles with sustained, physically plausible humanoid combat or weapon choreography" (via Notebookcheck). So the bar is hard for the leading cloud model too.
- **Depth beats pose for fast action** in one stress test of LTX-2.3's controls (stork.ai review: depth "often held up better than pose on complex action"). That fits our `depth-sword` result. **web**
- **Two-person motion from text exists:** InterGen ([paper](https://arxiv.org/abs/2304.05684), code `tr3e/intergen`) and an inference-only copy, [`ZeyuLing/motius-intergen-interhuman`](https://huggingface.co/ZeyuLing/motius-intergen-interhuman): 0.3B parameters, F32, licence CC BY-NC-SA 4.0, output shaped `(1, 120, 2, 262)`. Its InterHuman training data includes boxing but no weapons found. Text2Interact (ICLR 2026) is newer, code not confirmed. SocialStructureHHI builds on HunyuanMotion. None of these is checked further yet. **card, paper**
- A community LTX-2.3 fine-tune card ([`wolf1280/Singularity-LTX-2.3_OmniCine_V1`](https://huggingface.co/wolf1280/Singularity-LTX-2.3_OmniCine_V1)) recommends a timed action-timeline prompt and first-and-last-frame mode. That's a cheap prompt test, unchecked. **card**

**Where the fight motion comes from, three options:**
1. **Keyed by script with the hands locked on the hilt** (inverse kinematics): no download, sword-specific, and it tests whether real bodies plus blades hold up before choosing a motion source. It risks the same stiffness the user saw.
2. **Two-person text-to-motion** (InterGen or newer): the AI planner could write a fight in words. It needs a download and the user's yes, its data is boxing rather than swords, and its skeleton needs retargeting to the MakeHuman rig.
3. **Mocap of a person acting the fight** with a stick, through JustDirect's planned mocap feature: real motion, but the user would have to film it.

**Rec: option 1 first**, to prove the route on blades and hands, then a real motion source. *Attack:* if option 1 looks stiff, the user may reject it for that alone; so the review must ask about blades and hands separately from stiffness, which the `depth-sword` page failed to do (§3.2).

## 3.15 The fourth review, done by Claude (*2026-11-02; the user: "the dragons are still flying backwards", "can you review the images yourself, really most issues are very obvious, bending swords, multple swords, backward dragon, do i really need to do it"; this overrides §3.13's frame notes*)

**How clips are checked from now on:** every 8th frame of the whole clip as one sheet (`select='not(mod(n\,8))',tile=4x3`), plus full-size crops of the hard parts, checked against every fault the user has named: travel against facing, one straight blade each, hands on the hilt, fire from the mouth, legs, faces. A clip that fails is recorded here and never goes to the user; the user sees only clips that pass, for "good enough for a movie or not". My §3.13 note on the dragon was wrong because I read its later frames only; position against facing has to be compared across the whole clip.

| Clip | Verdict | What the sheet shows |
|---|---|---|
| `dragon-fix` | **Fail** (user and Claude) | Frames 0–40: it faces right and slides left, tail first, until only its head is in frame; the castle stays put, so it isn't the camera. Then the flame stays on the wall while the dragon flies off, and around frames 40–64 the wings and body melt into one shape. The new keyframe has the dragon so big and so close to the tower that there's no room to fly forward |
| `anime-fix` | **Fail on legs**, the action passes | A real run, jump, flight over the gap and landing in a crouch. But mid-air (around frames 46 and 58) and on landing the legs dissolve into a smear |
| `sword-mid-11` | **Fail** | Still for 2 s; when the black samurai raises his sword at frame ~48, the crossed blade stays standing by itself, a second sword; then the blades bend and break into stubs |
| `sword-mid-12` | **Fail** | Three blades from frame ~40 to 64: the black samurai holds one up and one pointing back past his body; the end is a smear |
| `vista-slow` | Pass on the frames | A steady slow push, the mountains hold. Speed and feel are the user's call |
| `crowd-slow` | Pass on the frames | 640×300 crops at frames 0, 32, 64 and 96: the faces in front hold. The user failed faces in `crowd-track` by watching, so this is unproven |

**Next, in order** (the user: "keep going gt it the best you can"; card, CPU and RAM agreed by message with JustStage and just-mocap first):
1. **Dragon with drawn paths** (`queue33.ps1`, `dragon-path`): §3.12's planned next step when words fail. Paths on its head, neck, chest, hips and tail carry it right and up over the tower, and four still points on the castle hold the camera. *Attack:* the keyframe still has the dragon huge and close; if it fails again, the keyframe gets a smaller dragon with the whole flight in view.
   **Result (measured and checked by Claude, not yet seen by the user):** `dragon-path`, 645 s, card 6,935 MiB, process 13.9 GB of RAM (more than the 8–12 GB I'd told the other sessions; the first try was stopped by the RAM guard at 341 s while a JustStage job held 38 GB). **Passes the fault check:** it flies forward, head first, right and up along the drawn path from the first frame to the last; the fire comes from its mouth onto the tower throughout; the body and wings hold on every 3rd frame from 36 to 60; the castle stays put. Stutter 1.03, change per quarter 2.0 2.1 2.0 1.8 (a steady glide), no cut (largest scene score 0.03). **Short of the prompt:** the wings stay raised in a glide instead of beating, and it ends with its head at the tower rather than over it. So drawn paths fix direction where the keyframe and words didn't, and the planner needs to write paths for anything that must travel a set way.
2. **Swords with real bodies** (`duel-bodies.py`, §3.14 option 1): two MakeHuman bodies shaped and rigged from JustStage's CC0 data (macros through JustStage's `core/makehuman.py`), simple armour shapes, katanas whose hilts carry both hands' IK targets, feet on IK, a keyed lunge, bind, shove, low slash and leap back, rendered as depth on the CPU. Then LTX with Union Control at 1280×704.
   **The 3D scene:** built and rendered in 40 s on the CPU (Cycles, 6 threads), first try: the rig, the weights, the IK hands and feet and the keyed fight all worked; the fingers close with +X bends (−X bends them backwards, checked on a 300% render). `out/duel-depth.mp4`.
   **Result, `duel-union`** (`queue34.ps1`, 637 s, card 7,863 MiB, process 14.1 GB; checked by Claude, not seen by the user): **the first sword clip that passes the blade checks.** One straight blade each in every 8th frame; both hands on the hilt; the blades lock in a clean X from frame 28 to 48 (full-size crops at 18, 30, 44, 56, 64, 70). One fault: a curved streak where red's blade whips back in the wind-up at frame 56, and black's legs ghost in the low slash at 64. Sparks fly at the low slash, not at the bind. Stutter 1.01, no cut. **The look fails:** my armour shapes came out as kilts with bare legs (black barefoot), and the wall and evenly spaced poles became a fence on a stage set. Small in the frame: change per quarter 0.6 0.5 1.5 0.4.
3. **Round 2** (`queue35.ps1`): the depth gets helmets (bowl and neck guard), shoulder plates, sleeves, hakama legs, a 70-stalk bamboo grove at many depths with no wall, and a closer camera (3.6 m, 32 mm). A first frame for it comes from what JustStage already measured on this card: FLUX.2 klein 4B with the Apache-2.0 refcontrol depth LoRA (`thedeoxen/refcontrol-FLUX.2-klein-4B-reference-depth-lora`, on disk at `E:\Dev\3D\just-stage\.dev\cache\loras\`; image 1 the depth, image 2 the reference, trigger `refcontrol`; JustStage RESEARCH, "refcontrol on our engine, measured"), with depth frame 1 for the pose and `kf4-sword-16` for the look. `duel-union2` is the new depth alone; the first frame goes into a second clip once it's checked.
   **Result, `duel-union2`** (checked by Claude): helmets, plated armour, armoured skirts, wide trousers and shin guards all came through, and the grove looks like a grove. Blades: one straight blade each with both hands on the hilt in every 8th frame and in full-size crops at 30 and 64; the fast wind-ups (red at 52–56) still smear into a bent streak. Stutter 1.02, change per quarter 1.0 0.8 2.5 0.5, no cut. **New fault:** the fighters look like children in costume armour, toy-like helmets and young faces. In the depth the helmeted head is about a sixth of the body's height, a child's proportion, because my helmet bowl (13.5 cm radius) and neck guard are too big. The first frame from the reference should bring adult faces; the helmet shrinks next round. The klein files: `cli.js`'s klein preset points at `just-house-paint\data\models`, which doesn't exist; the files are in `just-house-paint\data\probe\models\flux2-klein`, which `queue32a.ps1` and `queue35b.ps1` name directly. The first try of the stills failed on that, nothing was lost.
   **First frames** (`queue35b.ps1`, 35–37 s each, card up to 7,694 MiB, process 15.1 GB): all three seeds follow the depth (positions, stance, the blade tips touching where the depth puts them) and take the reference's look: adult men in lacquered armour, real helmets, a misty bamboo grove with sunset light. `kf5-duel-11` picked: straight blades, red's hands both on the hilt, black's right hand at the guard. So refcontrol turns a crude 3D pose into a film-quality first frame on this card in 35 s. Clip from it: `queue35c.ps1`, `duel-kf`.
   **Result, `duel-kf`** (647 s, card 7,721 MiB, process 14.1 GB; checked by Claude): **passes, the best sword clip so far.** Adult samurai in lacquered armour and real helmets in a misty grove, the look of the first frame held to the end. One straight blade each and both hands on the hilts in every 8th frame and in full-size crops at 18, 24, 30, 52, 56, 60, 64, 68 and 72: no extra blade, no bend, no fragments. The bind at 28–48 is a clean X. In the two fastest swings (black's cut at 18–24, red's wind-up at 52–56) the moving blade is a faint motion-blur streak, as a real camera shows it. Sparks fly at the low slash. Small faults: the shin guards read as flat boards, and the last quarter is a still guard (as keyed). Stutter 1.02, change per quarter 1.2 1.1 3.1 0.6, no cut.
   **The route that works for swords, all on 8 GB:** a 3D scene with real rigged bodies and the hands locked on the hilts by IK (Blender, 40–50 s on the CPU) → a first frame from depth frame 1 plus a look reference through FLUX.2 klein 4B and refcontrol (35 s) → LTX-2.3 one pass with the depth through Union Control and the first frame (11 min). For the app, the 3D scene is what the planner or JustStage writes.

4. **The same route on other action** (test scripts share `mhbody.py` now: the MakeHuman body, rig, IK legs, arm IK, clothes shapes, keys and the depth render; re-rendering the duel through it matched the old frames within 46–50 dB PSNR, only antialiasing noise): `leap-bodies.py` keys the anime leap with a girl's body (gender 0, age 0.35): a 3.4 m/s sprint with a foot down every 7 frames, a heel kick behind and a knee drive, the jump off the edge at frame 40, knees tucked over a 2 m gap, a landing 1.2 m lower at 62 and a crouch, the camera tracking. The first version had a foot waiting 1.3 m ahead at frame 1 (no key before its first contact) and heel kicks so low the strides read as kneeling; both fixed on the preview. Depth in 36 s. `queue37.ps1 stills`, then `queue37.ps1 clip <seed>`. The wing-beat dragon (`queue36.ps1`, `tracks-dragon-wings.json`) ran first.
   **Result, `dragon-wings`** (641 s, card 7,696 MiB, process 14.0 GB; checked by Claude): **passes.** Two more paths on the near wing's tip and middle, rising and falling four times while carried with the body, made the wings beat: up, level and down strokes alternate through every 3rd frame from 12 to 45, the body and head hold, the fire stays at the mouth, it still flies forward along the path. More motion than the glide: change per quarter 3.3 3.5 3.1 2.7 against 2.0 2.1 2.0 1.8. Stutter 1.01, no cut. So drawn paths control a creature's limbs as well as its travel. Added to the fifth review beside the glide.
   **Leap first frames:** with the whole `kf4-anime-14` scene as the reference, all three seeds drew **two girls** (the reference's, copied with its roof edge and lower roof, and the depth's) and turned my far blocks into floating panels. For the samurai the reference and the depth had the same layout, so they merged. Fixed the way JustStage uses refcontrol, with the person alone as the reference: a klein edit of `kf4-anime-14` into `kf6-girl` (the same girl, full body on white, 19 s), then refcontrol with depth frame 1 and her, the scene from the words. `kf6b-leap-11..13`: one girl each, in the depth's running pose, the reference's face, hair and uniform, a concrete rooftop at sunset (the far blocks became a stair hut and a wall). **Rule for the app:** refcontrol's reference is a character on a plain background, never a whole scene whose layout differs from the depth. `kf6b-leap-11` picked for `leap-kf`.
   **Result, `leap-kf`** (647 s, card 6,964 MiB, process 14.1 GB; checked by Claude): **close, not passed.** She runs, takes off from the edge, flies over the gap with her knees tucked (frames 46–54 clean), lands on the lower roof and crouches, the camera tracking; change per quarter 7.9 11.1 8.4 1.7, stutter 1.01, no cut. Faults: her legs and skirt blur at the jump (42) and on the way down (58), less than `anime-fix`; and the first frame had made a far block into a tall stair hut, which ends up beside the edge, so her raised hands seem to touch its corner mid-air, like climbing. Round 2: no far blocks (`leap-depth2`), "open sky" in the words; `kf6c-leap-11` and `13` have one girl each, **`kf6c-leap-12` drew two girls again**, so a first frame still needs the girl-count check before it's used. Clip: `leap-kf-leap-depth2`.
   **Result, `leap-kf-leap-depth2`** (667 s; checked by Claude): **close, not passed.** The wall is gone; run, takeoff and a clean tuck under open sky (frames 14–54), landing, crouch; stutter 1.00, no cut. But every frame from 55 to 62 shows her legs dissolving at 57–58 and her face blurring out as she lands. She falls 1.5 m in the last 6 frames while the camera drops too, the fastest motion in the clip. Round 3: `leap-bodies.py` takes the drop as an argument; 0.6 m (`leap-depth3`, frame 1 identical to `leap-depth2`'s, PSNR infinite, so `kf6c-leap-11` is reused), the camera drops half as far. Clip `leap-kf-leap-depth3`.
   **Result, `leap-kf-leap-depth3`** (662 s, process 13.9 GB; checked by Claude): **passes, with a blur noted.** Run, takeoff, a clean tuck over the gap, touchdown, crouch; in 16 frames from 14 to 96 the legs hold except a one- or two-frame blur at touchdown (57 and 62) and a brief colour streak on her raised arm at 56, much less than `anime-fix` or round 2. Stutter 1.00, change per quarter 5.9 7.2 5.3 1.1, no cut. On the fifth review with the blur named in its note and asked about. **So the real-body route works for a second kind of action and a second style** (anime), with the same three steps as the swords; the faster a body moves per frame, the more it smears, so the planner should keep falls and swings within what a frame can hold.
5. **Cars through a 3D scene** (the user on `track-car`: "it kind slides left instead of turning left"; on `action-car-one`: "POLCE" a deal breaker): `car-scene.py` drives a red sports car down a wet street toward a low corner camera, drifts it through a right turn (the nose 28° into the turn past its line, caught over 14 frames on the way out) and away down the cross street, an unmarked police car 24 frames behind on the same line, the camera panning after them. The first cars were boxes, which read as vans in the depth, so each car is now a side profile extruded (a fastback sports car, a saloon) with rounded edges and wheels; the first timing left the last 2 s an empty street. Depth in about 40 s. The police car is unmarked, with blue lights in the grille, so there's no lettering to garble; lettering in a shot stays a post step (§3.1).
   **First frames:** refcontrol (`queue38.ps1 stills`, the car alone on white from `kf-car` as the reference) **failed**: a big red car centred in a symmetric street, the depth's layout ignored, and two cars on seed 12. It's trained on people. Qwen-Image-Edit 2511 with `--offload-to-cpu` grew to **28 GB of RAM** and the guard stopped both seeds (my quote to JustStage had been 15 GB; its batch wasn't hurt). **FLUX 3 Image Klein with the depth frame as its one picture works** (`queue38b.ps1`, 69 s, card 6,062 MiB, process 14.3 GB): both seeds put the near wall, the street, the long shopfront and a small red car with headlights exactly where the depth has them. Shop signs are garbled text. So for scenes without people, FLUX 3 with the depth as the picture is the first-frame step; refcontrol stays for people. `kf7f-car-11` picked; clip `car-kf`.
   **Result, `car-kf`** (657 s, card 6,926 MiB, process 14.1 GB; checked by Claude): **passes.** The red car comes down the street, drifts through the corner past the camera with its body turning along the road (not sliding), spray and motion blur on the close pass, and races off; the camera pans; the police car follows through the same corner and drives away after it. The police car came out white with a blue light bar rather than unmarked black, and it carries no lettering. Both cars keep their shape. Stutter 1.00, change per quarter 4.7 14.7 13.7 9.0, no cut. On the fifth review.

**The route that works for action on 8 GB, from five shots:** a 3D scene (people as rigged MakeHuman bodies with IK hands and feet; cars as profile solids; keyed by script in Blender, depth on the CPU in under a minute) → a first frame (people: FLUX.2 klein + refcontrol with the character alone on white; no people: FLUX 3 with the depth as its picture) → LTX-2.3 one pass, 1280×704 × 97, the depth through Union Control (11 min). Creatures with no rig yet: drawn paths through Motion Track, on the limbs as well as the body. Faults left: fast motion smears (keep the speed per frame down), refcontrol can still draw a duplicate on an unlucky seed, and lettering is a post step.
6. **The explosion, rechecked** (no new run): `action-blast-two` from §3.3, the two-stage clip the user hasn't judged (second review, unanswered), **passes** the fault check: two arms and two legs in every 6th frame from 48 to 96 at full size through the dive and slide, five-fingered hands, the same face, the truck and fireball behind; stutter 1.02, largest scene score 0.06 (no cut). The user rated the one-pass `action-blast-one` Unusable for three arms. Moved onto the fifth review.

**The user's fifth review:** `http://127.0.0.1:18190/review.html?set=pass`, `E:\Dev\Web\test-just-direct\review-data-pass.js`, answers to `E:\Dev\Web\test-just-direct\review-answers-pass.json`. Only clips that passed: `duel-kf`, `leap-kf-leap-depth3`, `car-kf`, `action-blast-two`, `dragon-path` and `dragon-wings`, each with an overall rating and a question on what frames can't show (moves real or stiff; the touchdown blur; does the car turn; the dive and the fireball; which dragon). Checked in a hidden Edge: all six clips load (4 s), 22 questions, no answers file written.

## 4. Query log

Added 2026-10-31, for camera moves and the stutter:

- "LTX-2.3 camera control lora dolly pan orbit" -> the 2.3 Camera Controls LoRA on Hugging Face, Cameraman workflows, Lightricks' 19B dolly LoRAs. No orbit LoRA found.
- "LTX 2.3 how to get camera movement prompt camera not moving static fix" -> vendor and community guides, no official cause. The Runware guide (LTX-2.5 Pro) says a stated target helps; its "three root causes" came through in the search summary but aren't on the page, so they're not used here.
- "LTX-2 video choppy stutter duplicate frames every other frame looks like 12 fps" -> nothing on this fault in LTX; general playback threads only.
- "LTXVPreprocess img_compression value more motion LTX-2.3 image to video" -> copies of one ComfyUI page, nothing on compression.
- "LTX 2.3 image to video strength 1.0 vs 0.7 first frame more motion static result workflow" -> no direct comparison. fal's docs via Oxen: lower gives the model more freedom, example 0.7.
- Read at the source with the GitHub API: `constants.py`, `media_io/decode.py`, `blocks/image_conditioner.py`, `distilled.py`, `samplers.py`, `args.py`, `types.py`, `docs/conditioning.md`, `docs/pipelines.md`, `CHANGELOG.md`, `packages/ltx-pipelines/CLAUDE.md`; both 2.3 distilled workflow files, traced node by node.
- Hugging Face API: search "cameraman"; the file list of the camera LoRA; Lightricks/LTX-2.3's upscalers: x1.5 1,040 MB, x2 950 MB, temporal x2 250 MB.
- Failed: `ltx.io/blog/camera-motion-with-ai-video` (header overflow).

- "best AI video model for fast action scenes fight scenes 2026" -> vendor lists: Seedance 2.0 and Kling 3 for fights (overchat, a seller), Veo 3.1 general. No head-to-head.
- "how to fix motion blur and warping fast motion AI video generation local LTX Wan" -> the r/StableDiffusion snapshot in section 1; LTX's warble blog (fetch failed, header overflow, unread); hosted Retake.
- "sword fight AI video open source model workflow ComfyUI LTX-2.3 action" -> no sword workflow; a YouTube LTX fight workflow (unread); pose or depth V2V in GGUF workflow collections.
- "car chase AI video local model keep car shape consistent drift Wan 2.2 LTX" -> no shape test exists; Remade-AI car chase LoRA for Wan 2.1.
- "latest techniques controlling fast motion video diffusion pose control depth previs action choreography open weights" -> Go-with-the-Flow, MOFT.
- Hugging Face API, sorted by downloads: "ltx-2 lora", "ltx-2.3 lora", "ltx2 lora", "ltx-2.3", "ltx lora action", "ltx lora fight", "ltx lora motion" -> 130 LTX repos; the names filtered by motion words gave rows 1, 4, 6 and 7, Lightricks' camera LoRAs for LTX-2 19B and slow motion for 2.5.
- Lightricks docs read: `pipeline-selection.md`, `pipelines.md` §12, `multimodal-guidance.md`, `constants.py`, `dfr_pipeline.py` header.

- "LTX 2.3 fight LoRA civitai punches sword action motion lora" -> `Muapi/ltx-2.3-swordbattle` (a listing with no training data or examples, unchecked); `vpakarinen/motion-stabilizer-ltx-23`; **`Lightricks/LTX-2.3-22b-LoRA-Foley-V2A`**, gated, adds sound effects to silent video, worth testing for feature 11; `joyfox/LTX-2.3-Transition-LORA`.
- "LTX 2.3 settings for fast motion action shots steps sampler euler_ancestral res_2s tips reddit" -> no sampler findings. A prompt guide: "fast action" alone is unpredictable, name the concrete motion. A test: tiny moving objects wobble.
- YouTube `Povm432cVtg`, "LTX 2.3 Fight Scene Workflow in ComfyUI": the page gave the title only.

Lightricks' Motion Track example workflow (`LTX-2.3_ICLoRA_Motion_Track_Distilled.json`): a chase scene, one pass at 960×544 × 121, the same 8 distilled sigmas, `euler_ancestral_cfg_pp`, CFG 1, the dev model with the distilled LoRA at 0.5, IC-LoRA at 1. **Note for quality:** that is the dev model at half distilled strength, not our full distilled file.

Not searched yet: Civitai directly (named by a user; blocked to the fetch tools so far), LTX-Director, Reddit directly.

Added 2026-11-02, for swords through a 3D scene (§3.14):

- "latest techniques AI video sword fight weapons stay consistent 2026" -> no method. Notebookcheck on Sora 2, quoting OpenAI on weapon choreography; vendor lists and filler pages.
- "text to motion two person fight interaction model open source 2026" -> Text2Interact (ICLR 2026), InterGen through `ZeyuLing/motius-intergen-interhuman`, SocialStructureHHI.
- "LTX 2.3 pose control fight scene workflow sword" -> no sword workflow. stork.ai review (depth beat pose on complex action), MindStudio pose and depth guide, `ekokeko/LTX-2.3-Workflows` (RealisDance and Union Control, a copy of RuneXX's), the OmniCine fine-tune card.
- "InterHuman dataset fighting boxing sword two person interactions InterGen weights" -> the InterGen paper: about 107M frames, boxing named, no weapons found; official repo `tr3e/intergen`, weights not confirmed.
- Read: the `motius-intergen-interhuman` model card; `E:\Dev\3D\just-stage\extension\juststage\data\fetched\makehuman\LICENSE.md`.
