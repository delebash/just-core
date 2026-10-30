# ArtCraft, seen in the running app (2026-10-30)

Desktop 0.41.0 at F:\ArtCraft, and the web app at app.getartcraft.com. Looked only; nothing generated.

Tools on the desktop home screen. Create: Image, Video, Audio, Image to 3D Object, Image to 3D World, Angles (new), Moodboard
(beta), 3D Stage. Edit: Edit Image (inpaint), Video Frame Extractor, Remove Background, Video Editor (beta), Image Editor;
Video and Image Watermark Remover are marked SOON. Web sidebar: Image, Video, Audio, 3D Object, 3D World, Edit Image, Edit 3D,
Edit Video (beta), BG Change, Moodboard (beta), Frame Extract (new), Library, Folders.

Their film workflow, as the UI runs it, every step clicked by the user:
1. Stage: pick a preset or blank scene. Add: Characters (Storyboy, Story Girl, Knight, News Anchor), Objects, Memes, Sets (Concert
   Stage, Desert home, Waterfall, Office), Creatures, Animations (Sit, Idle, Walk, Punch), Skybox.
2. Select a character: colour, location, rotation, scale, Show skeleton, Enter Pose Mode, Add Animation.
3. Record mode: frame through the camera (focal length shown, rule-of-thirds grid), timeline 0:10, Capture a still or Record a video.
4. After Capture: a lightbox with Share, Download, Make Video, Edit on Canvas, Delete. Web stage title: "Compose a 3D scene and
   generate AI images and videos from it."
5. Example "Lone Drifter": a low-poly Storyboy in a Desert home set, plus a long prompt ("A real human actor, live-action
   photography, not 3D rendered...", face, build, pose, light), rendered to a photoreal shot with the same framing. The stage is
   the composition and the prompt does the look. The demo overlay also supports a video output (`?video=`).
6. Create Video: first and last frame, or Input Mode "Omni Reference"; models Seedance, Veo, Kling, Sora, MiniMax, Grok, Vidu,
   Happy Horse, Wan, Flux; 16:9, 720p, Normal, 5s; @Characters with Create New. Seedance 2.0, 5 s, 720p shows 93 credits.
7. Video Editor (beta), seen live: Assets, Sounds (empty), Text (Default text), Stickers (shapes), Effects (only Blur), Captions
   ("Captions view coming soon..."), Settings (30 fps; 16:9, 9:16, 1:1, 4:3, custom; background). Ripple on the timeline. Projects page.
8. Moodboard (beta): upload, library, notes, colours, sections, ratings; Grid, Canvas, Present.
9. Canvas: Blank Canvas sizes up to QHD 2560×1440, or start from an image or the library. Image Editor and Edit Image open the same page.
10. Audio: Suno Music, Instrumental toggle. Image to 3D World: World Labs Marble Mini.

No project ties these together: each tool is a separate page and the library is the shared store. Nothing plans shots.
The code size misled: the 2 MB video editor has one effect and no captions in use today.

Side effect to report: the first hidden Edge profile was auto-signed in to the user's Microsoft account and showed a sync notice.
That profile (332 MB) was deleted. The later window ran InPrivate with sign-in off.

---

# ArtCraft desktop: code-verified tool inventory

Commit read: `artcraft` @ 1f969a9 (2026-10-23), app version 0.42.0 (`crates/desktop/artcraft/tauri.conf.json:4`).
Method: read the UI code, starting from the desktop entry and tab switch, and followed into each lib. Nothing was run, so anything about runtime behaviour is from reading code. Where a claim needs a running app, it says **unverified**.

## How to read this

Evidence path shorthand:

| Short | Real path |
|---|---|
| `APP/` | `frontend/apps/artcraft/app/src/` |
| `LIB/` | `frontend/libs/` |
| `C/` | `frontend/libs/components/` |
| `VE/` | `frontend/libs/components/video-editor/src/lib/` |
| `PS/` | `frontend/libs/components/pagescene/src/lib/` |
| `PD/` | `frontend/libs/components/pagedraw/src/lib/` |
| `MB/` | `frontend/libs/components/moodboard/src/lib/` |
| `PB/` | `frontend/libs/components/promptbox/src/lib/` |
| `RS/` | `crates/desktop/artcraft/src/core/` |

"Hosted?" column values:

- **Wall**: the tool makes no server call of its own, but see global fact 1: the app cannot be reached without a hosted account.
- **Storage**: a hand tool whose files go through ArtCraft's API or CDN.
- **Gen**: the work itself runs on ArtCraft's hosted API and spends credits.

"Reach" column values: **Reachable**, **Flagged** (behind a hidden switch), **Hidden** (code exists, no way in from the UI), **Stub** (UI exists, does nothing real), **Dead** (code exists, not mounted).

Depth: **basic** = one or two controls; **medium** = a real tool with gaps a working editor would notice; **professional** = comparable to a dedicated app for that one job.

## Global facts that change every row

1. **The whole app sits behind a hosted login.** At startup, no session opens the login modal (`C/login-modal/src/lib/login-modal.tsx:61-85`). It is a full-screen overlay at `z-[100]` with the source comment "no dismiss control — login is required" (`login-modal.tsx:211,244`). It is always mounted (`APP/pages/MainApp.tsx:179`). So "by hand" tools still need a hosted account to reach.
2. **No local AI of any kind.** A grep for comfyui, onnxruntime, candle, stable-diffusion.cpp, llama_cpp, whisper, sherpa across the Rust desktop crate, the app and the libs returned no files. Every model runs remotely.
3. **Generation path.** Default route is the hosted `POST /v1/omni_gen/generate/{modality}` (`RS/commands/generate/omni/dispatch.rs:39-59`). Audio and mesh have no other route ("No direct provider adapter", `RS/commands/generate/generate_audio_command.rs:7`, `generate_mesh_command.rs:7`). Native Grok is "deliberately disabled" (`omni/request.rs:30`).
4. **The model list is server-driven.** "Membership + order come from the backend" (`LIB/model-list/src/lib/loader/buildModelsFromListing.ts:3`, `LIB/tauri-api/src/lib/models/modelsStore.ts:1-9`). The names below are the frontend overlay at this commit, so the live list may differ.
5. **Bring-your-own-account is narrow.** Midjourney can use the user's own web login (`LIB/model-list/src/lib/lists/ImageModels.ts:44`, `RS/commands/generate/generate_image/generate_image_command.rs:59`). Flux 1 Dev and Nano Banana 2 list Fal as a second provider (`ImageModels.ts:119,214`), and a provider hover menu exists (`C/model-selector/src/lib/classy-model-selector.tsx:204`), but no UI writes a Fal key: `provider-setup-modal.tsx:55` says `// TODO: None yet.`, `provider_set_api_key_command` has no frontend caller, and the OpenAI key block is not mounted (`C/settings-modal/src/lib/panes/AccountSettings/AccountSettingsPane.tsx:1-3`). Provider Priority is commented out (`C/settings-modal/src/lib/settings-modal.tsx:76-80`). Grok and Midjourney account blocks are reachable.
6. **How users reach things.** Top row is Home, Create Image, Create Video, Create Audio, Image Editor, 3D Stage (`APP/config/appMenu.tsx:38-70`, `APP/components/signaled/TopBar/TopBar.tsx:90-109`). Everything else is a card on Home (`APP/pages/PageApps/AppsIndexPage.tsx:13-19`). Desktop boots `src/index.tsx` directly (`frontend/apps/artcraft/app/index.html:42`), which mounts `MainApp` in a `BrowserRouter` with no route table (`APP/index.tsx:95-107`).

---

## 1. Story and script

**Nothing exists.** No script editor, screenplay format, beat sheet, shot list generator, story assistant, or prompt enhancer.

Searched for: `screenplay|script writ|story writ|beat sheet|treatment|logline|shot list|llm|chatgpt|gpt-4|prompt enhance|enhance prompt|improve prompt|rewrite` across `APP/pages`, `APP/components`, promptbox, pagedraw, moodboard, and pagescene comps. Only false positives (CSS `animationFillMode`, a regex variable `fullMatch`, a mention-text comment).

Nearest things: the per-shot Dialogue, Action and Notes text fields in Storyboard (section 3), and text notes on the Moodboard (section 3).

---

## 2. Characters, locations, props, references, reusable saved assets

| Tool | What the user can do | Depth | By hand? | Hosted? | Reach | Evidence |
|---|---|---|---|---|---|---|
| Characters (AI identity) | Create a named character from one reference image plus a description, list, view, edit name and description, delete, then @-mention it in a video prompt. Sent as `reference_character_tokens`. | Medium: real saved identity, but single image and one model only | No | Gen (`/v1/character/create`), Storage | Reachable **only when the model is Seedance 2.0** | `PB/CharactersModal.tsx:51,787-789`; `PB/PromptBoxVideo.tsx:1318-1320`; `LIB/api/src/lib/CharactersApi.ts:26` |
| @-mention prompt chips | Type `@` in a video prompt to insert characters or (in Omni Reference mode) reference files as chips | Medium | No | Gen | Reachable | `PB/PromptBoxVideo.tsx:996-997`; `PB/MentionTextarea.tsx` |
| Reference deck | Drag, paste or pick reference images (and videos, audio in Omni Reference mode), reorder, clear, preview. Image count limit comes from the model. | Medium | Input to AI only | Storage | Reachable | `PB/deck/ReferenceDeck.tsx`; `PB/PromptBoxVideo.tsx:480-485,715` |
| 3D asset library (presets) | Browse tabs All, Characters, Objects, Memes, Sets, Creatures, Animations, Skybox, with search. Drag into the stage. "Sets" are the only location concept; "Objects" the only prop concept. | Medium: categorised, but curated by the host | Yes | Storage (featured lists fetched from API, with demo fallback items) | Reachable | `PS/comps/AssetMenu/AssetModal.tsx:171-248,302-365`; `PS/comps/AssetMenu/utilities/fetchMediaItems.ts:77` |
| Upload 3D model | Upload GLB or FBX (FBX converted to GLB in a worker). Flag as character or animation (Mixamo types). | Medium | Yes | Storage | Reachable | `C/upload-modal/src/lib/Types.ts:48-53`; `C/upload-modal/src/lib/UploadModal3D/UploadModal3D.tsx:57-76`; `.../utilities/convertFbxToGlb.ts:1-2` |
| Upload image plane / splat | Upload PNG/JPG as a flat plane, or a `.spz` Gaussian splat | Basic | Yes | Storage | Reachable | `C/upload-modal/src/lib/Types.ts:55-63`; `PS/comps/Controls3D/Controls3D.tsx:218-235` |
| Reusable saved location or prop for AI | Not found. Only characters have a saved AI identity. | n/a | n/a | n/a | Absent | `LIB/api/src/lib/` has `CharactersApi` and no location or prop equivalent |

---

## 3. Moodboard, storyboard, shot planning

| Tool | What the user can do | Depth | By hand? | Hosted? | Reach | Evidence |
|---|---|---|---|---|---|---|
| Moodboard: boards | Create, switch, rename, delete boards | Basic | Yes | Wall | Reachable (badge BETA) | `MB/BoardPicker.tsx:48,73,103,119`; `MB/grid/BoardGridToolbar.tsx:220` |
| Moodboard: items | Hold images, videos, text notes, links, colours; upload, pick from library, paste | Medium | Yes | Storage for upload and library; a failed upload still leaves a local blob | Reachable | `MB/boards/boardTypes.ts:6`; `MB/grid/BoardGridToolbar.tsx:82-100`; `APP/pages/PageMoodboard/desktopMoodboardAdapter.tsx:17-33` |
| Moodboard: Grid view | Masonry with 3 densities, named sections (collapse, rename, delete keeping items), search, rating filter, multi-select bar, move to section | Medium: Lightroom-style triage | Yes | Wall | Reachable | `MB/boards/boardTypes.ts:12,23`; `MB/grid/BoardGridToolbar.tsx:115,145`; `MB/grid/SectionHeader.tsx:107-108`; `MB/grid/SmartSearchBar.tsx:29`; `MB/grid/SelectionBar.tsx:133-149` |
| Moodboard: Item inspector | Rate 1-5, add tags, see a 5-colour palette extracted client-side, copy hex | Medium | Yes | Wall | Reachable | `MB/grid/ItemInspector.tsx:133,155,182`; `MB/boards/palette.ts:1-4` |
| Moodboard: Canvas view | Freeform Konva board: select, lasso, text tools; group, ungroup, fit to grid, pack collage, auto-group by proximity, snapping, undo, redo, zoom, pan | Medium | Yes | Wall | Reachable | `MB/canvas/overlays/shortcuts.ts:29-55`; `MB/canvas/MoodboardToolbar.tsx:134-193`; `MB/canvas/layout/packCollage.ts`; `MB/canvas/layout/clusterProximity.ts` |
| Moodboard: Present | Full-screen slideshow with previous and next | Basic | Yes | Wall | Reachable | `MB/grid/PresentationView.tsx:41,152`; `MB/MoodboardWorkspace.tsx:65,75` |
| Moodboard: Use as reference | Send selected images into the Create Image prompt deck and switch tab | Basic | Bridge to AI | Needs media token, so hosted upload | Reachable | `APP/pages/PageMoodboard/desktopMoodboardAdapter.tsx:35-48`; `MB/grid/BoardCard.tsx:183` |
| Moodboard: persistence | Saves to local storage only on desktop: the adapter omits `persistence`. Blob items are not persisted ("would only resurrect broken tiles"). No export control found. | Basic | Yes | None | Reachable | `APP/pages/PageMoodboard/desktopMoodboardAdapter.tsx:91-95`; `MB/adapter.ts:75-78`; `MB/boards/BoardLibraryStore.ts:542-547` |
| Storyboard | Ordered shots with title, dialogue, action, director notes, duration; image by upload or sketch; drag to reorder; timeline with drag-to-resize duration; animatic-style playback; prev/next, go to start/end | Medium: real shot planning, no output | Yes, entirely | Wall. No AI and no server call in the page. | **Flagged**: needs Experimental unlocked by rapid clicks on the version number in About, then a toggle | `APP/pages/PageStoryboard/StoryboardStore.ts:4-13`; `APP/pages/PageStoryboard/Storyboard.tsx:81-115,262-320,788,864-896`; `APP/pages/MainApp.tsx:323-328`; `APP/config/appMenu.tsx:389,449-453`; `C/settings-modal/src/lib/panes/AboutSettingsPane.tsx:33-43`; `C/settings-modal/src/lib/panes/ExperimentalSettingsPane.tsx:51-59` |
| Storyboard: Sketch | Draw on a shot with tools, stroke colour, undo, clear | Basic | Yes | Wall | Flagged | `APP/pages/PageStoryboard/Storyboard.tsx:262-320,355,385-403` |
| Storyboard: save and export | **None.** Store is plain in-memory zustand with no persist; no export. Lost on app close. | n/a | n/a | n/a | Absent | `APP/pages/PageStoryboard/StoryboardStore.ts:29-85` |
| Shot list | No separate tool. Storyboard is the only one. | n/a | n/a | n/a | Absent | Same search as section 1 |

---

## 4. 3D staging: scene, posing, camera, lighting, animation

3D Stage is a top-row tab (`APP/config/appMenu.tsx:63-68`). It has two modes: Build and Record (`PS/comps/SceneModePill/SceneModePill.tsx:5-8`).

| Tool | What the user can do | Depth | By hand? | Hosted? | Reach | Evidence |
|---|---|---|---|---|---|---|
| Transform gizmo | Move (T), Rotate (R), Scale (G), world/local space (X), modal transform | Medium | Yes | Wall | Reachable | `PS/comps/Controls3D/Controls3D.tsx:148-167,289-303`; `PS/engine/editor/ModalTransformController.ts`; `C/keybinds/src/lib/presets.ts:28-31` |
| Object panel | Numeric location, rotation, scale; drag uniform scale; colour; delete | Medium | Yes | Wall | Reachable | `PS/comps/ControlPanelSceneObject/ControlPanelSceneObject.tsx:345-441` |
| Outliner | List objects; select; hide; lock; show skeleton; view from camera | Basic: no parenting or rename seen | Yes | Wall | Reachable | `PS/comps/Outliner/Outliner.tsx:85-131`; `PS/comps/ControlsTopButtons/ControlsTopButtons.tsx:382-393` |
| Scene edit commands | Duplicate (Ctrl+D), copy, paste, delete, deselect, snapping (N), grid (H), focus (F), undo, redo | Medium | Yes | Wall | Reachable | `C/keybinds/src/lib/presets.ts:33-46`; `PS/engine/editor/HistoryManager.ts` |
| Primitives | Cube, Cylinder, Donut, Sphere, Water, Point Light | Basic | Yes | Wall | Reachable (Objects tab) | `PS/signals/demoAssets/demoAssets.ts:35-78`; `PS/comps/AssetMenu/AssetModal.tsx:319` |
| Image planes and splats in scene | Drop library images as planes; drop meshes or splats at a raycast position | Medium | Yes | Storage | Reachable | `PS/Stage3DBody.tsx:387-460`; `PS/engine/pickDropPosition.ts` |
| Posing | Enter Pose Mode (K), rotate bones by FK with a rotate gizmo on bone spheres, show skeleton. Mixamo bone names assumed. No IK, no face posing found. | Medium: FK only | Yes | Wall | Reachable (shows when a poseable character is selected) | `PS/comps/PoseModeSelector.tsx:21-61`; `PS/engine/KinHelpers/FKHelper.ts:18-61`; `PS/engine/KinHelpers/` holds only FK helpers |
| Camera navigation | Free camera with WASD/QE, arrow look, mouse, wheel zoom; Gamer or Blender-like key presets | Medium | Yes | Wall | Reachable | `PS/hooks/useFreeCam.ts:22,229`; `C/keybinds/src/lib/presets.ts:16-25,120-129` |
| Render camera | Toggle looking through the render camera, preview window, letterbox toggle, aspect 16:9, 3:2, 1:1, 2:3, 9:16 | Basic to medium: single camera | Yes | Wall | Reachable | `PS/comps/CameraStatusPill/CameraStatusPill.tsx:24-44`; `PS/comps/PreviewEngineCamera/PreviewEngineCamera.tsx:90-125`; `PS/comps/AspectRatioMenu/AspectRatioMenu.tsx:21-27` |
| Multiple cameras, focal length control | Handlers for add, select, rename, focal length exist but are not used in the JSX. Focal length display has no reachable setter now. No depth of field found. | n/a | n/a | n/a | **Dead** | `PS/Stage3DBody.tsx:289-383` defined, not used in JSX at `469-597`; `PS/comps/CameraStatusPill/CameraStatusPill.tsx:25` |
| Lighting | One tool: Point Light. Set colour and position. Intensity fixed at 1 and range 100 in code, no slider. Base scene lights are fixed. | **Basic** | Yes | Wall | Reachable | `PS/engine/scene.ts:75-77,335-341,634-637` |
| Skybox | Empty, Day, Night, Gray, Black | Basic | Yes | Wall | Reachable | `PS/signals/demoAssets/demoSkyboxItems.ts:9-39`; `PS/comps/AssetMenu/AssetModal.tsx:366-371` |
| Timeline: transform keyframes | Per-object keyframes (add with I), move, delete, nudge; duration; fps default 30; play, seek, step; focus-selected filter; Save or Cancel the timeline | Medium | Yes | Wall | Reachable | `PS/engine/timeline/types.ts:20-30,93-94`; `PS/engine/editor/TimelineController.ts:198,263-326`; `PS/comps/Timeline/TimelineEditor.tsx:328-385,603-610`; `C/keybinds/src/lib/presets.ts:50-59` |
| Timeline: easing curve | Per-keyframe cubic bezier with Linear, In, Out, In-Out presets and two drag handles | Medium | Yes | Wall | Reachable | `PS/comps/Timeline/MotionPopover.tsx:22-27,168-186` |
| Character animation clips | Add clips to a character row, move, trim, loop toggle, remove; baked GLB clips can be added too | Medium | Yes | Storage for clip library | Reachable | `PS/comps/Timeline/TimelineClipRow.tsx:178,287-331`; `PS/engine/timeline/types.ts:36-61`; `PS/engine/editor/TimelineController.ts:345-509` |
| Clip gap transition | Blend one clip's exit pose into the next along a curve, auto-opens a 0.3s gap | Medium | Yes | Wall | Reachable | `PS/engine/timeline/types.ts:54-60,92`; `PS/comps/Timeline/TimelineEditor.tsx:536-568` |
| Animation library | Tabs All, Presets, Uploaded, with search; upload Mixamo clips. Demo list has 37 fallback items used only while the API has no featured clips. | Medium | Yes | Storage | Reachable | `PS/comps/AssetMenu/AnimationsModal.tsx:27,88-105,130-141`; `PS/comps/AssetMenu/hooks/useAnimationLibrary.tsx:31-32` |
| Camera keyframing | Not confirmed. Keyframes are generic per object UUID and the camera frustum is a scene object, but nothing in the timeline code names it. | ? | ? | ? | **Unverified** | `PS/engine/timeline/types.ts:27-30` |
| Motion capture, face capture, lip sync | Not found. `@mediapipe/tasks-vision` is declared with no import found in the app or pagescene. | n/a | n/a | n/a | Absent | `frontend/apps/artcraft/package.json` |
| Record mode: Capture | Tab or button to Record mode (read-only, camera locked). Capture a PNG of the render camera, which auto-uploads to the gallery and opens the lightbox. | Basic | Yes | Storage | Reachable | `PS/comps/RecordControls/RecordControls.tsx:20-50`; `PS/actions/recordOutput.ts:10-36`; `APP/pages/PageScene/sceneOutputAdapter.ts:16-33` |
| Record mode: Record | Step the timeline frame by frame and encode. See section 11 for output limits. | Basic | Yes | Storage to keep the file | Reachable; needs a timeline | `PS/engine/recording/TimelineRecorder.ts:34-120`; `PS/actions/recordOutput.ts:40-76` |
| AI render from the 3D stage | `PromptBox3D` is exported, but no `<PromptBox3D` exists in any lib or app. Desktop passes `modelSelectorPlacement="prompt-box"`, and `inlineModelSelector` is built but never rendered. So no prompt or Generate on the stage. The route to AI is Capture, then lightbox actions. | n/a | n/a | n/a | **Dead** | `PB/PromptBox3D.tsx` (1,091 lines); `PS/Stage3DBody.tsx:215-228,572`; `APP/pages/PageScene/PageScene.tsx:87` |
| Help and stats | Shortcut cheatsheet, stats overlay (backquote) | Basic | Yes | Wall | Reachable | `PS/comps/ControlsTopButtons/ControlsTopButtons.tsx:399-411`; `C/keybinds/src/lib/presets.ts:36` |

---

## 5. Image generation and image editing

| Tool | What the user can do | Depth | By hand? | Hosted? | Reach | Evidence |
|---|---|---|---|---|---|---|
| Create Image | Prompt plus reference images, fullscreen prompt, model picker, aspect ratio, resolution, count; live feed of pending and failed jobs; grid or list | Medium: wide model range, no negative prompt or seed control (grep of the prompt box finds neither) | No | Gen; Midjourney can use own session | Reachable | `APP/pages/PageImage/TextToImage.tsx:183-213`; `PB/PromptBoxImage.tsx:489,518,543`; `LIB/model-list/src/lib/lists/ImageModels.ts` |
| Image models (overlay) | Grok, Midjourney, Flux Pro 1.1 Ultra, Flux Pro 1.1, Flux 1 Dev, Flux 1 Schnell, Nano Banana, 2, Pro, GPT Image 1, 1.5, 2, 2.5 Flare, 2.5 Sunburst, Seedream 4, 4.5, 5 Lite; editing and angles models below | n/a | No | Gen | Server decides | `LIB/model-list/src/lib/lists/ImageModels.ts:15-667`; `C/model-selector/src/lib/model-selectors-for-pages.tsx:63-98` |
| Image Editor: drawing | Konva canvas: select and move, rectangle/circle/triangle (shape cycle key), brush (1-64, colour), eraser (1-64), upload image, canvas background colour, shape colour, reset canvas, blank canvas presets 512 to 2560 wide | Medium drawing tool, **but no way to save it out by hand**: see export row | Yes | Wall (local files stay local) | Reachable, top-row tab | `PD/components/ui/SideToolbar.tsx:232-350,356-380`; `PD/BlankCanvasModal.tsx:18-42`; `PD/PageDraw.tsx:659-680` |
| Image Editor: layers | Lock, bring to front, forward, backward, to back, duplicate, delete, copy, paste | Basic | Yes | Wall | Reachable | `PD/components/ui/ContextMenu.tsx:144-215`; `PD/PageDraw.tsx:1121-1160` |
| Image Editor: AI edit | Flatten canvas, prompt plus reference images, aspect Wide/Tall/Square, resolution 1K/2K/4K, instructive edit via model. Variants collect in a history stack; click to make one the base. | Medium | No | Gen. Provider picker hidden on this page. | Reachable | `PD/PageDraw.tsx:821-941,1236-1289`; `PB/PromptBox2D.tsx:110-138`; `PD/HistoryStack.tsx` |
| Image Editor: Inpaint mask | Mask tool with add or erase, size 1-100. Enabled only for inpaint models (Flux Pro Inpaint, Flux Dev Juggernaut). Tooltip says "Model unsupported" otherwise. | Medium | Mask by hand, fill by AI | Gen | Reachable, model-gated | `PD/components/ui/InpaintToolBar.tsx`; `PD/components/ui/SideToolbar.tsx:298-304,465-467`; `PD/PageDraw.tsx:432-433,874-877`; `LIB/model-list/src/lib/lists/ImageModels.ts:648-679` |
| Image Editor: 3D on canvas | A canvas image node can carry a GLB; Edit 3D overlay lets the user orbit, scale and change FOV, then commit back as an image | Basic but unusual | Yes | Wall | Reachable: drag a mesh from My Library onto the canvas | `PD/PageDraw.tsx:84-159,194-253,596-625,634-645,1360-1378`; `PD/stores/SceneState.ts:232-241`; `PD/components/Model3DOverlay.tsx:13-24` |
| Image Editor: export by hand | `saveSceneToFile`, `loadSceneFromFile`, `exportSceneAsJson` exist but have no UI caller (only a spec). No download or toBlob in the page. | n/a | n/a | n/a | **Dead** | `PD/stores/SceneState.ts:272-278`; grep shows only `APP/pages/Stores/TabState.spec.ts:78` |
| Angles | Upload a photo, set rotation (8 stops), tilt (-30 to 60), zoom (0, 5, 10) on a 3D orbit sphere and sliders, generate a new view. Models: Qwen Edit 2511 Angles, Flux 2 LoRA Angles. "Best angles" toggle commented out. | Medium: novel, single purpose | No | Gen | Reachable (Home, NEW) | `APP/pages/PageAngles/Angles.tsx:97-98,280-301`; `APP/pages/PageAngles/AnglesStore.ts:20-22`; `APP/pages/PageAngles/OrbitSphere.tsx`; `LIB/model-list/src/lib/lists/ImageModels.ts:570-612` |
| Remove Background | Upload or pick an image, cut out, hold to compare, download, thumbnail strip. Also right-click on the 2D canvas. | Basic | No | Gen | Reachable (Home) | `APP/pages/PageRemoveBackground/RemoveBackground.tsx:135,424-439,580-606`; `RS/commands/enqueue/image_bg_removal/artcraft/handle_generic_bg_removal_artcraft.rs` |
| Recreate | From lightbox, reload a past image or video's prompt and references into its page | Medium | Bridge | Storage | Reachable | `C/lightbox-modal/src/lib/lightbox-modal.tsx:1043-1061`; `APP/components/generation-feed/desktopMediaActions.ts:187-214` |
| Upscale, image relight, face swap, generative fill on image without a mask model | **None reachable.** `upscal` appears only as an unused field in a legacy class. `Magnific` is an enum name with no model. | n/a | n/a | n/a | Absent | `APP/Classes/ApiManager/VideoApi.ts:24`; `LIB/api-enums/src/lib/common/generation_provider.ts:13` |

---

## 6. Video generation

| Tool | What the user can do | Depth | By hand? | Hosted? | Reach | Evidence |
|---|---|---|---|---|---|---|
| Create Video: Keyframe mode | Prompt plus first frame and, where supported, last frame. Swap frames. Aspect, resolution, bitrate, output format, duration, batch count, generate-with-sound toggle (each shown only if the model supports it). | Medium: good per-model options, no timeline or shot continuity. `negative_prompt` exists in the request type but has no UI. | No | Gen | Reachable | `PB/PromptBoxVideo.tsx:142,450-462,764-773,1427-1491`; `LIB/tauri-api/src/lib/generate/GenerateVideo.ts:14-48` |
| Create Video: Omni Reference mode | Multi-reference generation from images, videos and audio, @-mentioned in the prompt, for models that support it (default limits 3 video, 2 audio) | Medium to professional for this job | No | Gen | Reachable, model-gated | `PB/PromptBoxVideo.tsx:407,458,478-485,850-911` |
| Video models (overlay) | Grok Video, Grok Imagine 1.5, Kling 1.6 Pro to 3.0 Pro (7), Happy Horse 1.0, Seedance 1.0 Lite, 1.5 Pro, 2.0, 2.0 Fast, Sora 2, Sora 2 Pro, Veo 2, 3, 3 Fast, 3.1, 3.1 Fast. Default Seedance 2.0. | n/a | No | Gen | Server decides | `LIB/model-list/src/lib/lists/VideoModels.ts:8-589`; `C/model-selector/src/lib/defaultModelForPage.ts:11` |
| Video result feed | Pending, failed, completed; lightbox; autoplay toggle; select | Basic | n/a | Storage | Reachable | `APP/pages/PageVideo/ImageToVideo.tsx:190-205`; `APP/components/signaled/TopBar/TopBar.tsx:532-537` |
| Cost calculator | Estimate credits before generating | Basic | n/a | Gen | Reachable | `APP/pages/PageVideo/ImageToVideo.tsx:244`; `LIB/tauri-api/src/lib/cost_estimate/` |

---

## 7. Audio: voice, music, sound effects

| Tool | What the user can do | Depth | By hand? | Hosted? | Reach | Evidence |
|---|---|---|---|---|---|---|
| Create Audio: Music | Prompt, style prompt, instrumental toggle (`suno_music`, default) | Medium: delegates to Suno | No | Gen | Reachable | `PB/PromptBoxAudio.tsx:51,149-152`; `LIB/model-list/src/lib/classes/metadata/ModelDescriptions.ts:67` |
| Create Audio: Remix, Sample | Start from exactly one audio reference, keep-lyrics toggle (`suno_remix`, `suno_sample`) | Medium | No | Gen | Reachable | `LIB/omni-gen/src/lib/omni-gen-audio.ts:17-20`; `PB/PromptBoxAudio.tsx:153,170-174` |
| Create Audio: Sound effects | `suno_sounds`: BPM, key (12 options plus Auto), loopable | Medium | No | Gen | Reachable | `PB/common/SoundsSettingsPopover.tsx:17-29`; `PB/PromptBoxAudio.tsx:154-156`; `ModelDescriptions.ts:69` |
| Create Audio: Seed Audio | `seed_audio_1p0`: Tuning popover for sample rate, speed, volume, pitch; audio or image reference (not both) | Medium | No | Gen | Reachable if server lists it | `PB/common/AudioTuningPopover.tsx:81-109`; `PB/PromptBoxAudio.tsx:157-162,202-208`; `ModelDescriptions.ts:71` |
| Audio model list | Comes only from `GET /v1/omni_gen/models/audio`, no overlay | n/a | n/a | Gen | Server decides | `PB/PromptBoxAudio.tsx:69`; `APP/pages/PageAudio/CreateAudio.tsx:35` |
| Voice, text-to-speech, dialogue | **No dedicated tool.** `TtsApi` class has no caller in pages. Whether Seed Audio does speech is **unverified**: its pitch and speed controls would fit, but nothing says so. | n/a | n/a | n/a | Absent | `APP/Classes/ApiManager/TtsApi.ts:20`; `ModelDescriptions.ts:71` |
| Sound library in the editor | The Sounds tab renders, but desktop passes no sounds adapter, so it falls to the empty adapter: no results. | n/a | n/a | n/a | **Stub** | `APP/pages/PageVideoEditor/index.tsx:57-66`; `VE/adapters/default/empty-sounds-adapter.ts:8-30`; `VE/sounds/components/assets-view.tsx:132` |

Audio mixing on the timeline is in section 9.

---

## 8. 3D generation

| Tool | What the user can do | Depth | By hand? | Hosted? | Reach | Evidence |
|---|---|---|---|---|---|---|
| Image to 3D Object | Upload or pick an image, choose Hunyuan 3.0 (default, about 2 min) or 2.0 (about 45 s), generate a textured mesh, preview in a viewer, Add to 3D scene, download GLB (`ImageTo3DExperience.tsx:965-998`). No polycount or topology options found. | Basic | No | Gen. Hosted-only route. | Reachable (Home, plus wand button on stage) | `APP/components/experiences/ImageTo3DExperience.tsx:79,455-458`; `LIB/model-list/src/lib/lists/Object3DModels.ts:7-27`; `RS/commands/generate/generate_mesh_command.rs:6-9`; `PS/comps/Controls3D/Controls3D.tsx:248-263` |
| Image to 3D World | One or more images plus prompt, Marble Mini (about 30 s) or Plus (about 5 min), output a Gaussian splat for the stage | Basic | No | Gen. Native World Labs code remains but the listed provider is ArtCraft. | Reachable (Home) | `APP/components/experiences/ImageTo3DExperience.tsx:421-424,642`; `LIB/model-list/src/lib/lists/SplatModels.ts:9-29`; `RS/commands/generate/generate_splat_command.rs:6-14` |
| 3D viewer | Orbit a mesh or splat from lightbox or results | Basic | Yes | Storage | Reachable | `C/viewer-3d/src/lib/viewer-3d.tsx`; `C/lightbox-modal/src/lib/lightbox-modal.tsx:573` |

---

## 9. Picture editing on a timeline

Video Editor is a Home card with badge BETA (`APP/config/appMenu.tsx:347-356`), a port of OpenCut (`VE/core/managers/project-manager.ts:19`, `VE/VideoEditor.tsx:121`). Everything here runs in the WebView on `opencut-wasm` plus WebGPU. No AI anywhere in it.

Hosted note for this whole section: **import is Storage**, because importing a local file uploads it to the hosted library first (`VE/media/processing.ts:174`, `APP/pages/PageVideoEditor/adapters/media-source-adapter.ts:88-96`, `.../upload-by-kind.ts:30-35`), then resolves it by token (`media-source-adapter.ts:98-101`). After that, editing uses the local File and makes no calls.

| Tool | What the user can do | Depth | By hand? | Hosted? | Reach | Evidence |
|---|---|---|---|---|---|---|
| Media bin | Import (button), drag, paste; Browse library; grid or list; sort by name, type, duration, size; delete | Medium | Yes | **Storage** | Reachable | `VE/panels/assets/views/assets.tsx:118-123,125,245-290,609-735`; `VE/media/use-paste-media.ts` |
| Preview | Play, editable timecode HH:MM:SS:FF, duration, zoom Fit/25-200%, fullscreen, on-canvas transform handles with snap guides, inline text edit | Medium | Yes | Wall | Reachable | `VE/preview/components/toolbar.tsx:27-144`; `VE/preview/components/transform-handles.tsx`; `VE/preview/components/snap-guides.tsx`; `VE/preview/components/text-edit-overlay.tsx` |
| Transport | Space or K play; J and L jump -1 s and +1 s (not shuttle); arrows frame step; Shift+arrows 5 s; Home/Enter, End | Medium | Yes | Wall | Reachable | `VE/actions/definitions.ts:155-164`; `VE/actions/use-editor-actions.ts:89-219` |
| Cut | Split at playhead (S), split and drop left (Q), split and drop right (W); acts on selection, or all clips under playhead | Medium to professional for the basic cut | Yes | Wall | Reachable | `VE/actions/definitions.ts:165-167`; `VE/actions/use-editor-actions.ts:221-299`; `VE/timeline/components/timeline-toolbar.tsx:145-163` |
| Trim | Drag either clip edge, group resize across a selection | Medium | Yes | Wall | Reachable | `VE/timeline/components/timeline-element.tsx:652-654`; `VE/timeline/controllers/resize-controller.ts`; `VE/timeline/group-resize/compute-resize.ts` |
| Ripple | Toolbar toggle. Deletes and trims close gaps on affected tracks. No roll, slip or slide found. | Medium | Yes | Wall | Reachable | `VE/timeline/components/timeline-toolbar.tsx:293-298`; `VE/ripple/apply.ts`; `VE/ripple/diff.ts` |
| Move and select | Drag between tracks, group move, box select, select all, snapping (N, to playhead, clips, bookmarks) | Medium | Yes | Wall | Reachable | `VE/timeline/group-move/resolve-move.ts`; `VE/selection/hooks/use-box-select.ts`; `VE/timeline/snapping/`; `VE/timeline/bookmarks/snap-source.ts` |
| Clipboard | Copy, paste at playhead, duplicate, delete; also for keyframes | Medium | Yes | Wall | Reachable | `VE/actions/definitions.ts:81-92,117-120`; `VE/clipboard/handlers/keyframes.ts`; `VE/timeline/components/timeline-element.tsx:427-510` |
| Tracks | Types: video, text, audio, graphic, effect. Main track plus overlay and audio lanes. Mute, hide per track; remove; empties auto-pruned. No lock or rename found. | Medium | Yes | Wall | Reachable | `VE/timeline/types.ts:29`; `VE/timeline/components/index.tsx:666-692,830-871`; `VE/core/index.ts:65-81` |
| Clip mute and hide | Per clip via menu, also multi-select | Basic | Yes | Wall | Reachable | `VE/actions/definitions.ts:121-128`; `VE/timeline/components/timeline-element.tsx:444-474` |
| Detach audio | Extract a video's source audio to its own clip, recover it | Medium | Yes | Wall | Reachable | `VE/timeline/audio-separation/index.ts:12-17`; `VE/commands/timeline/element/toggle-source-audio-separation.ts`; `VE/timeline/components/timeline-toolbar.tsx:165-176` |
| Bookmarks (markers) | Toggle at playhead, drag, note, colour, duration range, show notes over preview | Medium | Yes | Wall | Reachable | `VE/timeline/bookmarks/components/bookmarks.tsx:345-416`; `VE/timeline/bookmarks/preview-overlay-source.tsx:10-12`; `VE/preview/components/context-menu.tsx:70-83` |
| Timeline view | Zoom buttons, slider, scroll, collapse/expand keyframes per clip, resizable panels | Basic | Yes | Wall | Reachable | `VE/timeline/components/timeline-toolbar.tsx:303-328`; `VE/timeline/components/timeline-element.tsx:475-483`; `VE/VideoEditor.tsx:206-284` |
| Scenes (sequences) | Sheet to switch and delete scenes. **No create or rename control**, and `createScene` has no caller. So one main scene only. | Basic | Yes | Wall | Reachable but effectively single | `VE/components/editor/scenes-view.tsx:28-173`; `VE/core/managers/scenes-manager.ts:31,67` |
| Replace media | Menu item is `disabled` | n/a | n/a | n/a | **Stub** | `VE/timeline/components/timeline-element.tsx:495-500` |
| Freeze frame | Button is `disabled`, "coming soon" | n/a | n/a | n/a | **Stub** | `VE/timeline/components/timeline-toolbar.tsx:186-191` |
| Transitions | **None.** No crossfade, dissolve, wipe. Grep finds no timeline transition. | n/a | n/a | n/a | Absent | Grep of `transition` in VE: only CSS and comments |
| Titles and text | One "Default text" item. Content, font, size, colour, align, bold, italic, underline, strikethrough, letter spacing, line height, background box with colour, radius, padding, offset. Google Fonts plus system fonts. No title templates or text animators. | Medium | Yes | Wall (Google Fonts needs internet) | Reachable | `VE/text/components/assets-view.tsx:26-44`; `VE/params/registry.ts:186-337`; `VE/fonts/google-fonts.ts:4` |
| Shapes | Rectangle, Ellipse, Polygon (sides), Star (points, depth): fill, stroke width, colour, align, corner radius | Medium | Yes | Wall | Reachable (Stickers tab, Shapes) | `VE/graphics/definitions/`; `VE/graphics/components/graphic-tab.tsx:67,173`; `VE/stickers/categories.ts:1-6` |
| Logo stickers | Category commented out; provider returns empty | n/a | n/a | n/a | **Dead** | `VE/stickers/categories.ts:3-4`; `VE/stickers/providers/logos.ts:23-26` |
| Transform and blend | Position, scale X/Y, rotate, opacity, 17 blend modes | Medium to professional | Yes | Wall | Reachable | `VE/params/registry.ts:86-165`; `VE/panels/properties/registry.tsx:32-40` |
| Keyframes | Toggle per parameter on clips and effects; keyframes shown on the clip; drag, box select, copy, paste. Interpolation linear, hold, bezier. | **Professional**: per-parameter, on every numeric and colour field | Yes | Wall | Reachable | `VE/panels/properties/components/keyframe-toggle.tsx`; `VE/animation/types.ts:48-56`; `VE/animation/keyframes.ts` (1,371 lines); `VE/timeline/controllers/keyframe-drag-controller.ts`; `VE/animation/effect-param-channel.ts` |
| Graph editor | Bezier curve popover with Smooth, Ease out, Ease in, In out, Pop, Linear, plus saved custom presets | Medium to professional | Yes | Wall | Reachable | `VE/timeline/components/timeline-toolbar.tsx:214-242`; `VE/timeline/components/graph-editor/easing-presets.ts:12-19`; `.../graph-editor/custom-presets-store.ts`; `.../graph-editor/popover.tsx:22` |
| Masks | 9 types: Split, Cinematic bars, Rectangle, Ellipse, Heart, Diamond, Star, Text, Freeform pen with editable points. Position, size, scale, rotation, feather, stroke (width, colour, align), invert, multiple masks. On-canvas handles. No keyframe control in the masks tab, so masks look static. | **Professional** for an editor of this size | Yes | Wall | Reachable (video, image, graphic clips) | `VE/masks/builtin/definitions/index.ts:16-75`; `VE/masks/components/masks-tab.tsx:348-350,443-640,696-723`; `VE/masks/freeform/path.ts`; `VE/masks/use-mask-handles.ts` |
| Effects | **Exactly one: Blur** (Gaussian, intensity 0-100). Add to a clip, or as a layer on an effect track affecting what's below. Reorder, toggle, keyframe. | Basic: strong plumbing, one effect | Yes | Wall | Reachable | `VE/effects/definitions/index.ts:4`; `VE/effects/definitions/blur.ts:81-95`; `VE/effects/components/assets-view.tsx:59-70`; `VE/effects/components/effects-tab.tsx:127,183` |
| Colour | **None.** No wheels, curves, LUT, exposure, saturation, chroma key. | n/a | n/a | n/a | Absent | Grep of `grade|correct|wheel|lut|exposure|saturation|contrast|brightness|chroma|keyer|greenscreen` in VE: no matches |
| Speed | Constant rate 0.01x to 5x, change-pitch toggle (soundtouch stretch). No ramps, reverse not found. | Medium | Yes | Wall | Reachable (video, audio clips) | `VE/speed/components/speed-tab.tsx:118-150`; `VE/retime/rate.ts:1-3`; `VE/retime/presets.ts:4-5`; `VE/retime/audio-stretch.ts` |
| Audio mix | Clip volume -60 to +20 dB, draggable volume line on the clip, volume keyframable, mute, waveform. Automatic master limiter at export. **No fades, EQ, compressor controls, buses or meters found.** | Medium | Yes | Wall | Reachable | `VE/timeline/audio-constants.ts`; `VE/timeline/components/audio-volume-line.tsx`; `VE/timeline/components/audio-waveform.tsx`; `VE/media/audio-mastering.ts:1-17` |
| Project settings | Frame rate 24, 25, 30, 60, 120; aspect 16:9, 9:16, 1:1, 4:3 or custom pixels. Raises fps to match imports. No 23.976 or 29.97 preset. | Basic | Yes | Wall | Reachable | `VE/panels/assets/views/settings/index.tsx:244-318`; `VE/fps/presets.ts`; `VE/canvas/sizes.ts`; `VE/core/managers/project-manager.ts:205-226` |
| Canvas background | Solid colours, gradient sets, custom colour, or blur fill with presets | Basic | Yes | Wall | Reachable | `VE/panels/assets/views/settings/background.tsx:13-19,32-84` |
| Guides and safe areas | Grid, TikTok, Reels, Shorts, Spotlight guide overlays exist. The popover that picks one is commented out (`v0.4.0`), and `GridPopover` has no other use. | n/a | n/a | n/a | **Dead** | `VE/preview/components/toolbar.tsx:39-51`; `VE/guides/registry.ts:11-17` |
| Onboarding and shortcuts | Welcome dialog ("A lot of features are still being built out... Save often"). Shortcuts dialog with rebind and reset. | Basic | Yes | Wall | Reachable | `VE/components/editor/onboarding.tsx:103-125`; `VE/actions/shortcuts-dialog.tsx:27-67`; `VE/components/editor/editor-header.tsx:149-154` |

---

## 10. Finishing and post: VFX, cleanup, upscaling, captions, frame extraction

| Tool | What the user can do | Depth | By hand? | Hosted? | Reach | Evidence |
|---|---|---|---|---|---|---|
| Video Frame Extractor | Load a video, scrub, set a start, frame count (default 10) and spacing in ms (default 100), extract PNGs in the WebView. Per frame: Save (uploads to the library, no direct disk save on this page), or Turn into Video (uploads, then sends to Create Video). | Basic | Yes | Extraction Wall; Save and Turn into Video are Storage (each uploads) | Reachable (Home) | `APP/pages/PageVideoFrameExtractor/VideoFrameExtractor.tsx:24-26,268-300,356-381,408-440,795-845` |
| Background Change (VFX) | Source video plus reference image, optional prompt, optional mask, showcase examples. Model is Beeble SwitchX ("Relight, change location, swap objects"). Submit can return "backend coming soon". | Medium if it ran | No | Gen | **Hidden**: filtered out of the app list ("hidden in the desktop app for now"). `case` in MainApp still exists; a grep for `BACKGROUND_CHANGE` finds no other caller. | `APP/config/appMenu.tsx:387-388`; `APP/pages/PageBackgroundChange/PageBackgroundChange.tsx:46-68`; `LIB/model-list/src/lib/lists/VideoModels.ts:601-607`; `C/vfx/src/` |
| Video Watermark Remover | **Fake.** Waits 2 seconds and shows "Watermark removal completed!". No API call. | n/a | n/a | n/a | **Stub**, and Hidden: card shows SOON with no action | `APP/pages/PageVideoWatermarkRemover/VideoWatermarkRemover.tsx:187-197`; `APP/config/appMenu.tsx:279-287` |
| Image Watermark Remover | **Fake**, same pattern | n/a | n/a | n/a | **Stub**, Hidden | `APP/pages/PageImageWatermarkRemover/ImageWatermarkRemover.tsx:88-98`; `APP/config/appMenu.tsx:288-296` |
| Captions | Tab shows "Captions view coming soon...". Comment: "transcription subsystem... deferred per port scope". | n/a | n/a | n/a | **Stub** | `VE/panels/assets/index.tsx:13-19,30`; `VE/panels/assets/assets-panel-store.tsx:54-57` |
| Upscaling, denoise, stabilise, frame interpolation, object removal, lip sync | **None found.** | n/a | n/a | n/a | Absent | Greps in section 5, plus `denois|noise` in VE and `rife|topaz|lip.?sync` across app and libs: no live feature |

Remove Background is in section 5. Blur and masks are in section 9.

---

## 11. Export and delivery

| Tool | What the user can do | Depth | By hand? | Hosted? | Reach | Evidence |
|---|---|---|---|---|---|---|
| Video Editor export | MP4 (H.264, AAC with Opus fallback) or WebM (VP9, Opus). Quality Low, Medium, High, Very high (mediabunny presets, no numeric bitrate). Include audio toggle. Destinations: save to disk, save to library (both on by default). Progress, cancel, retry. | Basic to medium | Yes | Disk: Wall. Library: Storage. | Reachable | `VE/components/editor/export-button.tsx:273-387`; `VE/services/renderer/scene-exporter.ts:33-38,94-127`; `VE/export/index.ts:4-11`; `APP/pages/PageVideoEditor/adapters/export-sink-adapter.ts:55-136` |
| Export resolution and range | **No resolution picker.** Output is the project canvas size and project fps. Exports the active scene. No in/out range, no ProRes, no image sequence, no audio-only, no XML/EDL/AAF, no subtitle file. | n/a | n/a | n/a | Absent | `VE/core/managers/renderer-manager.ts` (`exportProject`); `VE/export/index.ts:11` |
| Editor snapshot | Save or copy a PNG of the current frame, right-click on preview. Save uses a browser-style download; whether it lands correctly in the Tauri WebView is **unverified**. | Basic | Yes | Wall | Reachable | `VE/preview/components/context-menu.tsx:63-68`; `VE/core/managers/renderer-manager.ts:42-62` |
| 3D Record output | MP4 H.264 at QUALITY_HIGH. **Maximum 1280x720** (16:9), 1200x800, 1080x1080, 800x1200, 720x1280. **Video only, no audio track.** WebM exists in code but no UI passes it. Review modal offers only discard or Upload & continue, so the file reaches disk through the library. | Basic | Yes | **Storage** | Reachable | `PS/engine/recording/TimelineRecorder.ts:38,75-84`; `PS/engine/editor/CameraController.ts:255-268`; `PS/actions/recordOutput.ts:53`; `PS/comps/CompletionModal/CompletionModal.tsx:130-154` |
| Library download | Download from lightbox or menu, bulk select on Image and Video pages | Basic | n/a | Storage | Reachable | `C/lightbox-modal/src/lib/lightbox-modal.tsx` (Download); `APP/components/generation-feed/desktopMediaActions.ts:57-124`; `APP/components/signaled/TopBar/TopBar.tsx:270` |
| Download settings | Default folder, reveal folder, auto download, ask location, naming scheme with custom format | Basic | n/a | Local | Reachable | `C/settings-modal/src/lib/panes/DownloadsSettingsPane.tsx:103,150-242` |
| Share link | Copy a `getartcraft.com/media/` link | Basic | n/a | Storage | Reachable | `APP/components/generation-feed/desktopMediaActions.ts:47,153` |
| Image Editor, Storyboard, Moodboard export | **None** (see sections 3 and 5) | n/a | n/a | n/a | Absent | As cited |
| 3D scene export (GLB, FBX, USD) | **None.** Scene saves as JSON to the hosted API. | n/a | n/a | n/a | Absent | `PS/engine/save_manager.ts:206-240` |

---

## 12. Project management: library, saving, undo, history

| Tool | What the user can do | Depth | By hand? | Hosted? | Reach | Evidence |
|---|---|---|---|---|---|---|
| My Library | Modal over any tab. Filters All, Image, Video, Audio, Mesh, Splat, Uploaded. Refresh, show uploads, reopen after adding, drag out into 2D, 3D, moodboard, folders. | Medium to professional for an asset manager | n/a | Storage (all of it) | Reachable | `C/gallery-modal/src/lib/gallery-modal.tsx:326-334,2802-2834` (3,771 lines); `APP/components/signaled/TopBar/TopBar.tsx:624-634` |
| Folders | Create, nested subfolders, rename, delete, star, colour, cover image, add and remove items, bulk add | Medium | n/a | Storage (`/v1/folders/*`) | Reachable | `LIB/api/src/lib/FoldersApi.ts:45-315`; `C/gallery-modal/src/lib/gallery-modal.tsx:500-571,2951,3494,3513`; `C/gallery-modal/src/lib/FolderColorRow.tsx` |
| Tags | Top-5 sidebar, All tags word cloud, per-item tags in lightbox | Medium | n/a | Storage | Reachable | `C/gallery-modal/src/lib/gallery-modal.tsx:401,411-458,3052`; `C/lightbox-modal/src/lib/tags/TagsSection.tsx:79` |
| Lightbox | Full view, prev/next, copy prompt, show references, Recreate, Edit Image, Make Video, Remove BG, Make 3D, Make 3D World, Download, Add to Scene, delete | Medium | n/a | Storage | Reachable | `C/lightbox-modal/src/lib/lightbox-modal.tsx:393-409,1043-1199` |
| Bulk select | Multi-select in library with add to folder, delete | Basic | n/a | Storage | Reachable | `C/gallery-modal/src/lib/gallery-modal.tsx:662-666,3627-3631` |
| Upload anywhere | Top-bar upload, OS drop of GLB, PNG/JPG, SPZ opens the matching uploader | Basic | n/a | Storage | Reachable | `APP/components/signaled/TopBar/UploadImagesButton.tsx:17-33`; `APP/components/GlobalFileDropHandler/GlobalFileDropHandler.tsx:16-18,58-69` |
| Task queue | Top-bar list of jobs and status, copy prompt, dismiss; history survives restart (local task DB). No cancel-job control found. | Basic | n/a | Local DB plus Gen polling | Reachable | `APP/components/signaled/TopBar/TaskQueue.tsx:164,279-285,591`; `RS/commands/generate/omni/dispatch.rs:72-80` |
| Credits and plans | Balance, Buy credits, cost calculator, plan, upgrade | Basic | n/a | Hosted | Reachable | `APP/components/signaled/TopBar/TopBar.tsx:538-620` |
| Settings | General, Downloads, Accounts, Plan & Credits, Appearance (themes), Keybinds, Alerts (sounds), About; Experimental when unlocked | Basic | n/a | Local mostly | Reachable | `C/settings-modal/src/lib/settings-modal.tsx:69-88` |
| Keybinds | Remappable with conflict check for 3D, 2D, moodboard; presets Gamer and Blender-like. Video editor has its own separate system. | Medium | n/a | Local | Reachable | `C/keybinds/src/lib/registry.ts:3-6`; `C/keybinds/src/lib/presets.ts:120-129`; `C/keybinds/src/lib/settings/KeybindsSettings.tsx` |

### Saving and undo per tool

| Surface | Undo | Save | Where it goes | Can it be reopened? | Evidence |
|---|---|---|---|---|---|
| Video Editor | Yes, command stack, Ctrl+Z | Autosave, 800 ms debounce | IndexedDB (`video-editor`) | **No UI.** `openProject` and `listProjects` have no caller. Each mount creates a new `local-<uuid>` project. | `VE/core/managers/save-manager.ts:15-22`; `VE/adapters/default/indexeddb-project-storage.ts:8-10`; `VE/core/managers/project-manager.ts:130,244`; `APP/pages/PageVideoEditor/index.tsx:70-88` |
| 3D Stage | Yes, HistoryManager | File menu: New, Load my scene, Save (Ctrl+S), Save as copy. Save needs login token. | Hosted JSON plus thumbnail. In-memory tab cache between tab switches. | Yes, via hosted list | `PS/comps/ControlsTopButtons/ControlsTopButtons.tsx:249-344`; `PS/engine/save_manager.ts:206-240`; `APP/pages/PageScene/PageScene.tsx:21-25`; `APP/pages/PageScene/useTauriPageSceneAdapter.tsx:190-219` |
| Image Editor | Yes, store undo and redo | None. Store survives tab switches in memory. | Memory | No | `PD/stores/SceneState.ts:194-196`; `APP/pages/Stores/TabState.ts:47-50` |
| Moodboard | Canvas only (`MoodboardHistoryStore`) | Automatic | Local storage | Yes, on that machine | `MB/canvas/MoodboardHistoryStore.ts`; `MB/boards/BoardLibraryStore.ts:542` |
| Storyboard | Sketch strokes only | None | Memory | No | `APP/pages/PageStoryboard/Storyboard.tsx:308`; `APP/pages/PageStoryboard/StoryboardStore.ts:29` |
| Generated media | n/a | Automatic | Hosted library | Yes | `C/gallery-modal/src/lib/gallery-modal.tsx` |

---

## Notes

### (a) Libraries behind the main tools

| Library | Used for | Evidence |
|---|---|---|
| `konva` 9, `react-konva` | Image Editor canvas, Moodboard Canvas | `frontend/package.json`; `PD/PaintSurface.tsx`; `MB/canvas/MoodboardStage.tsx` |
| `three` 0.171 | 3D Stage engine, 3D viewer, FBX to GLB (FBXLoader, GLTFExporter), Water | `frontend/package.json`; `PS/engine/scene.ts:8`; `C/upload-modal/src/lib/UploadModal3D/utilities/convertFbxToGlb.ts:1-2` |
| `@sparkjsdev/spark` 0.1.10 | Gaussian splat rendering | `frontend/package.json`; `C/viewer-3d/src/lib/disposeObject3D.spec.ts:2` |
| `ammo.js` | Physics WASM, loaded at engine start. No physics UI seen. | `PS/engine/editor.ts:34,190-193` |
| `mediabunny` 1.29 | Decode metadata, thumbnails, export, 3D recording | `VE/media/mediabunny.ts`; `VE/services/renderer/scene-exporter.ts:3-14`; `PS/engine/recording/TimelineRecorder.ts:6-13` |
| `opencut-wasm` 0.2.10 | Editor compositor over WebGPU, media time, timecode | `VE/services/renderer/compositor/wasm-compositor.ts`; `VE/services/renderer/gpu-renderer.ts`; `VE/VideoEditor.tsx:117-140` |
| `soundtouchjs` 0.3 | Pitch-preserving retime | `VE/retime/audio-stretch.ts`; `VE/types/soundtouchjs.d.ts` |
| `zustand`, `@preact/signals-react` | App and tool state | Throughout |
| Tauri 2, Rust `artcraft_client`, `artcraft_router` | Desktop shell, task DB, provider routing | `crates/desktop/artcraft/Cargo.toml`; `RS/commands/generate/` |
| `react-colorful`, Radix, hugeicons | Pickers and editor UI | `PD/components/ui/SideToolbar.tsx:5`; `VE/components/ui/` |

### (b) How tied each tool is to the hosted API, and where its adapter is

| Group | Tie | Adapter or seam |
|---|---|---|
| Everything | Login wall | `C/login-modal/src/lib/login-modal.tsx`, `C/login-modal/src/lib/NativeLoginBridge.ts` |
| Image, Video, Audio, Mesh, Splat generation | Full | `RS/commands/generate/omni/dispatch.rs`; frontend `LIB/tauri-api/src/lib/generate/`. Rust handlers per provider under `RS/commands/generate/generate_image/providers/` and `generate_video/`. Provider abstraction exists, but only Midjourney is usable by a user at this commit. |
| Model catalogue | Server listing, overlay fallback | `LIB/model-list/src/lib/loader/buildModelsFromListing.ts`, `LIB/tauri-api/src/lib/models/modelsStore.ts` |
| Remove Background, Angles, Inpaint, AI edit | Full | `LIB/tauri-api/src/lib/enqueue/`, `RS/commands/enqueue/image_bg_removal/`; `APP/pages/PageDraw/PageDraw.tsx:98-132` |
| Characters | Full | `LIB/api/src/lib/CharactersApi.ts` |
| Library, folders, tags, prompts | Full | `LIB/api/src/lib/{FoldersApi,TagsApi,PromptsApi,MediaFilesApi}.ts`, `C/gallery-modal` |
| Video Editor | Clean adapter seam: storage, media, auth, toast, export, gallery, sounds. Desktop uses local IndexedDB for projects but hosted for media. Swapping `media-source-adapter` for the bundled `createLocalFileMediaSource` would cut the import tie. | `VE/adapters/index.ts`, `VE/adapters/default/local-file-media-source.ts`, `APP/pages/PageVideoEditor/adapters/` |
| 3D Stage | Clean adapter seam (`PageSceneAdapter`). Editing is local. Assets, saves and outputs are hosted. | `PS/adapter.ts`, `APP/pages/PageScene/useTauriPageSceneAdapter.tsx`, `APP/pages/PageScene/sceneOutputAdapter.ts` |
| Image Editor | Adapter seam (`PageDrawAdapter`). Drawing is local. | `PD/adapter.ts`, `APP/pages/PageDraw/PageDraw.tsx` |
| Moodboard | Adapter seam. Desktop omits persistence, so local only. | `MB/adapter.ts`, `APP/pages/PageMoodboard/desktopMoodboardAdapter.tsx` |
| Storyboard, Frame Extractor core | Barely tied | `APP/pages/PageStoryboard/`, `APP/pages/PageVideoFrameExtractor/` |

### (c) Surprises

Smaller than the name suggests:

1. **"Image Editor" cannot save its own work.** You can paint and arrange, but there is no download. The only way out is an AI generation. Save and load functions exist with no caller.
2. **"Video Editor" has no transitions, one effect, and no colour tools.** No crossfade at all.
3. **Video Editor work is not reopenable.** Autosave writes to IndexedDB, but no UI lists or opens projects. By code reading, leaving the tab unmounts the page, and returning creates a new project id that replaces the timeline, while the singleton media bin survives. So a tab switch appears to discard the timeline. **Needs a run to confirm.**
4. **Importing a local clip uploads it to ArtCraft's servers.** There is no offline edit path as wired.
5. **Watermark removers are fake.** A 2-second timeout then a success toast. Unreachable today, thankfully.
6. **Captions and the Sounds library are empty shells.** The tabs are visible and look finished.
7. **"Exit project" probably blanks the editor.** It closes the project, then navigates to `/projects`, but desktop has no route table, so nothing remounts (`VE/components/editor/editor-header.tsx:75-87`, `APP/index.tsx:103-107`). **Unverified.** Rename and Delete Project dialogs are wired but have no menu items; rename works inline.
8. **3D Record is 720p and silent**, and cannot be written straight to disk.
9. **The 3D stage no longer generates.** Marketing line "Precision control. Great for AI film" (`APP/config/appMenu.tsx:67`), but `PromptBox3D` (1,091 lines) is not mounted anywhere. The path is Capture, upload, then Make Video from the lightbox.
10. **Lighting is one point light** with no intensity control.
11. **Characters work with one model only**: the button shows only for Seedance 2.0.
12. **Storyboard is hidden behind an easter egg**, holds nothing after close, and has no AI.
13. **Bring-your-own-key is mostly gone.** Fal and OpenAI key code remains with no UI, and Provider Priority is commented out.
14. **No voice tool**, despite audio being a top-level tab.
15. **Scenes in the video editor cannot be created.**

Bigger than the name suggests:

16. **Moodboard** is a two-mode tool with triage, sections, palettes, lasso, auto-layout and a presenter. But it stores locally and has no export.
17. **Video Editor keyframes and masks** are the strongest thing in the app: per-parameter keyframes, a bezier graph editor with saved presets, nine mask types with a pen tool.
18. **My Library** is a serious asset manager: nested coloured starred folders, tag cloud, drag into any tool.
19. **Angles** is a clean single-purpose tool with no real equivalent in a generic editor.
20. **3D timeline** has clip blending across gaps, which is more than a simple pose tool usually has.

Other notes:

- **OS file drop into the Video Editor may not work.** `tauri.conf.json` does not disable Tauri's drag-drop, which normally intercepts HTML5 file drops, and the "drop-bridge component" that `media-source-adapter.ts:16-19` describes is not in `PageVideoEditor`. Paste and the Import button are the safe routes. **Unverified.**
- The editor expects WebGPU. Without it, it falls back to a degraded renderer and shows "For the best experience, open this editor in Chrome" (`VE/VideoEditor.tsx:95-102`). Worth checking on macOS. **Unverified.**
- J and L are 1-second jumps, not shuttle speed, which an editor from another NLE will trip on.
- The Home page lists Image Editor twice under different names ("Edit Image" and "Image Editor"), both go to the same tab (`APP/config/appMenu.tsx:262-269,358-365`).

### Not verified, by design

Nothing was launched. The items marked unverified above need a running app: Video Editor tab-switch loss, Exit project blanking, OS drop into the editor, snapshot save in Tauri, camera keyframing, and whether Seed Audio can produce speech. Live model lists were not checked; only the frontend overlay was read. Whether the server accepts anonymous uploads does not matter given the login wall.
