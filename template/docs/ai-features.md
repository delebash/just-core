# The AI features

Each AI feature is a row under **AI Settings → Routing by feature**, with its own engine preset —
the model and settings it runs on. One model can serve every feature, or a feature can point at a
stronger one.

## Suggest a note title

The **Suggest a title** button in the note editor ([Notes](notes.md)). It reads the note's text
and answers with a short title in the note's own language. It runs on the **Short answers**
preset: a low temperature and no thinking, because a title should come back quickly.

## Changing what a feature says or runs on

Select the feature under **Routing by feature**. Its prompt — what the model is told — is shown and
can be edited and saved in the Lab, and its preset can be pointed at another model or provider.
**Reset** puts the original back.
