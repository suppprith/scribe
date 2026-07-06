# NLP modules reference

scribe's transcription-to-summary intelligence is a fully custom NLP pipeline —
no external LLM, no paid API. It's built from ten self-contained modules that
live in [`server/app/nlp/`](../../server/app/nlp). Each module powers a real
product feature **and** ships with a standalone, runnable demo script in
[`server/scripts/nlp/`](../../server/scripts/nlp), so every capability can be
inspected and reproduced in isolation.

## Setup

All commands run from `server/` inside its virtualenv:

```bash
cd server
python -m venv .venv && .venv/Scripts/activate   # Windows (source .venv/bin/activate elsewhere)
pip install -r requirements.txt
python scripts/download_models.py                # NLTK data, spaCy model, translation models
```

`download_models.py` is idempotent. The translation-model conversion is the only
step that needs PyTorch (`pip install torch`, CPU build is fine) — and only
once; inference afterwards runs on CTranslate2 without it.

## Module map

| # | Module | Code | Demo script | API endpoint(s) | Product feature |
|---|--------|------|-------------|-----------------|-----------------|
| 1 | Word & sentence tokenization | `app/nlp/tokenize.py` | `tokenize_demo.py` | `POST /nlp/tokenize` | Transcript segmentation (foundation for everything below) |
| 2 | Stemming vs lemmatization | `app/nlp/normalize.py` | `normalize_demo.py` | `POST /nlp/normalize` | Search & keyword normalization |
| 3 | Word frequency, stopwords & POS | `app/nlp/keywords.py` | `keywords_demo.py` | `POST /nlp/keywords` | Keyword & topic extraction in summaries |
| 4 | Parsing (constituency + dependency) | `app/nlp/parse.py` | `parse_demo.py` | `POST /nlp/parse` | Action-item & decision detection |
| 5 | N-gram language modeling | `app/nlp/ngram.py` | `ngram_demo.py` | `POST /nlp/predict`, `POST /nlp/sentence-probability` | Phrase modeling & next-word prediction |
| 6 | WordNet word-sense disambiguation | `app/nlp/wordnet_wsd.py` | `wordnet_demo.py` | `POST /nlp/disambiguate` | Word-sense lookup over transcript terms |
| 7 | Template-based NLG | `app/nlp/nlg.py` | `nlg_demo.py` | `POST /nlp/nlg` | **The summary generator** (via `/summarize`) |
| 8 | Machine translation | `app/nlp/translate.py` | `translate_demo.py` | `POST /nlp/translate` | Caption/transcript/summary translation to English |
| 9 | Information retrieval (TF-IDF) | `app/nlp/ir.py` | `ir_demo.py` | `POST /nlp/search`, `POST /nlp/ir-metrics` | Transcript keyword search + extractive highlights |
| 10 | Word embeddings (Word2Vec) | `app/nlp/embeddings.py` | `word2vec_demo.py` | `POST /nlp/embeddings`, `POST /nlp/similar` | Semantic transcript search |

The summarization pipeline ([`app/pipeline/summarize.py`](../../server/app/pipeline/summarize.py),
`POST /summarize`) chains modules 1 → 3 → 4 → 9 → 7 into the structured meeting
summary the bot posts to Discord; run `python scripts/summarize_demo.py` to see
the whole chain end to end. Deterministic, CPU-only.

Every demo below is run as `python scripts/nlp/<name>_demo.py` from `server/`,
and every sample output is captured from a real run.

---

## 1. Word & sentence tokenization

**Objective.** Split raw text into sentences and word tokens — correctly
handling abbreviations ("Dr.", "a.m."), contractions ("Let's"), and punctuation.
NLTK Punkt + Treebank tokenizers.

**In the product.** The first step of every downstream module: the summarizer,
keyword extractor, and search all operate on these units.

```
$ python scripts/nlp/tokenize_demo.py

INPUT:
  Dr. Smith joined the call at 10 a.m. We reviewed the Q3 roadmap, then assigned action items. Let's ship by Friday!

SENTENCES (2):
  1. Dr. Smith joined the call at 10 a.m. We reviewed the Q3 roadmap, then assigned action items.
  2. Let's ship by Friday!

WORD TOKENS (25):
  ['Dr.', 'Smith', 'joined', 'the', 'call', 'at', '10', 'a.m.', 'We', 'reviewed', 'the', 'Q3',
   'roadmap', ',', 'then', 'assigned', 'action', 'items', '.', 'Let', "'s", 'ship', 'by', 'Friday', '!']
```

Note the abbreviation handling: "Dr." and "a.m." do not end sentences.

## 2. Stemming vs lemmatization

**Objective.** Contrast two normalization strategies side by side: Porter
stemming (fast, crude suffix chopping) vs WordNet lemmatization (dictionary-
backed, POS-aware). The `DIVERGES` column marks where they disagree.

**In the product.** Normalizing query and keyword forms so "organizing",
"organized", and "organizations" match each other in search and frequency
counts.

```
$ python scripts/nlp/normalize_demo.py

TOKEN           STEM            LEMMA           DIVERGES
--------------------------------------------------------
studies         studi           study           <--
better          better          well            <--
running         run             run
geese           gees            goose           <--
were            were            be              <--
organizations   organ           organization    <--
organizing      organ           organize        <--
meetings        meet            meeting         <--
```

The classic failure cases are visible: the stemmer mangles irregular forms
("geese" → "gees") and over-merges ("organizations" and "organizing" both →
"organ"), while the lemmatizer returns real words.

## 3. Word frequency, stopwords & POS tagging

**Objective.** Count content-word frequencies after stopword removal, and tag
parts of speech (NLTK averaged-perceptron tagger).

**In the product.** The `keywords` field of every meeting summary, and the
topic-selection signal for the NLG generator.

```
$ python scripts/nlp/keywords_demo.py

TOP KEYWORDS (stopwords removed):
  budget       3
  roadmap      2
  timeline     2

POS TAGS (first 12):
  The          DT
  roadmap      NN
  meeting      NN
  covered      VBD
  ...
```

## 4. Parsing — constituency + dependency

**Objective.** Two parse views of the same text: noun-phrase chunking with an
NLTK `RegexpParser` grammar (constituency-style), and full dependency relations
from spaCy. On top of them, rule-based detection of action-item sentences
(imperatives, "X should …", "please …").

**In the product.** The `action_items` and `decisions` fields of every meeting
summary.

```
$ python scripts/nlp/parse_demo.py

CONSTITUENCY - noun-phrase chunks (NLTK RegexpParser):
  - The new release plan
  - the budget
  - the updated roadmap

DEPENDENCY - relations (spaCy):
  plan         nsubj      -> looks (NOUN)
  looks        ROOT       -> looks (VERB)
  budget       dobj       -> finalize (NOUN)
  ...

ACTION ITEMS:
  [we should] We should finalize the budget by Friday.
  [imperative] Send the updated roadmap to the team.
```

## 5. N-gram language modeling

**Objective.** Train bigram/trigram models with add-one smoothing over a small
corpus; predict the next word after a prefix and score whole sentences
(log-probability + perplexity).

**In the product.** Phrase modeling over transcript text — exposed via
`/nlp/predict` and `/nlp/sentence-probability`.

```
$ python scripts/nlp/ngram_demo.py

next after 'we need to'  [trigram]: review (0.50), ship (0.50)
next after 'we should'   [trigram]: review (1.00)
next after 'the team will' [trigram]: ship (1.00)

P('We need to review the budget.')       log_prob=-15.81  perplexity=7.2
P('Purple monkeys ship dishwashers.')    log_prob=-16.50  perplexity=15.6
```

The in-domain sentence scores markedly lower perplexity than the nonsense one —
the model has learned the corpus's phrasing.

## 6. WordNet word-sense disambiguation

**Objective.** Explore lexical ambiguity with WordNet: enumerate a word's
senses, then pick one in context with the Lesk algorithm.

**In the product.** Sense lookup for ambiguous transcript terms via
`/nlp/disambiguate`.

```
$ python scripts/nlp/wordnet_demo.py

INPUT:
  I went to the bank to deposit cash near the river.

bank  (18 senses)
    - bank.n.01: sloping land (especially the slope beside a body of water)
    - depository_financial_institution.n.01: a financial institution that accepts deposits...
    ...
  Lesk picked: bank.n.07 -> a slope in the turn of a road or track...

cash  (4 senses)
  Lesk picked: cash.n.01 -> money in the form of bills or coins
```

The output is deliberately honest about Lesk's limits: gloss-overlap picks the
right sense for "cash" but a wrong one for "bank" in this sentence — a classic
illustration of why WSD is hard.

## 7. Template-based NLG — the summary generator

**Objective.** Turn structured meeting facts (participants, duration, topics,
decisions, action items, highlights) into fluent Markdown prose using templates
with grammatical agreement, list formatting, and graceful empty-section
handling. This module **replaces the LLM** the project once used for summaries.

**In the product.** Every meeting summary posted to Discord and shown in the
web app is rendered by this module, fed by the `/summarize` pipeline.

```
$ python scripts/nlp/nlg_demo.py

## Meeting summary

3 participants took part: Ana, Bo, and Chen. The session ran for about
25 minutes 30 seconds. The conversation centered on budget, roadmap, timeline,
and marketing.

### Decisions
- Approved the Q3 marketing spend
- Moved the release to Friday

### Action items
- **Ana**: Finalize the budget
- **Chen**: Fix the API bug blocking deploy
```

The demo also renders an edge case (solo speaker, nothing decided) to show the
templates degrade gracefully: `_No decisions were recorded._`

## 8. Machine translation

**Objective.** Neural machine translation with MarianMT (Helsinki-NLP `opus-mt`
models) running int8 on CTranslate2 — the same lightweight CPU runtime the ASR
uses. Model pairs are converted once by `download_models.py`; inference needs no
PyTorch.

**In the product.** Non-English speech is translated to English in live
captions, transcripts (original ⇄ English toggle), and before summarization, so
mixed-language meetings produce a coherent English summary.

```
$ python scripts/nlp/translate_demo.py

============================================================
TRANSLATION DEMO (MarianMT / CTranslate2, int8)
============================================================

[hi → en]
  in : नमस्ते, आज की बैठक में आपका स्वागत है।
  out: Hi, welcome to today's meeting.

[th → en]
  in : เราต้องส่งรายงานให้เสร็จภายในวันศุกร์
  out: We need to finish the report by Friday.

[en → hi]
  in : Please finalize the budget before Friday.
  out: शुक्रवार से पहले बजट पूरा करें.
```

Requires the converted models (`python scripts/download_models.py`); without
them the script exits with a clear pointer to that command. On Windows, run
with `PYTHONUTF8=1` so the console can print the non-Latin scripts.

## 9. Information retrieval — TF-IDF search + evaluation

**Objective.** A vector-space IR system over transcript sentences: TF-IDF
vectors, cosine-ranked search, and a proper evaluation harness reporting
Precision, Recall, F-measure, and MAP against labeled relevance judgments.

**In the product.** Keyword transcript search in the web app, and the
extractive `highlights` of every summary (sentence centrality under the same
TF-IDF model).

```
$ python scripts/nlp/ir_demo.py

  query: 'budget approval marketing'
    [0.73] #2 Marketing will launch the campaign after budget approval.
    [0.37] #0 We finalized the Q3 budget and approved the marketing spend.

EVALUATION (top_n=2):
  'budget approval marketing': P=1.00 R=1.00 F1=1.00 AP=1.00
  MEAN: P=1.00 R=1.00 F1=1.00 MAP=1.00
```

## 10. Word embeddings — Word2Vec

**Objective.** Train a skip-gram Word2Vec model (gensim) and explore the vector
space: raw embeddings and nearest-neighbour similarity.

**In the product.** Semantic transcript search: the query is expanded with
Word2Vec neighbours trained on the session's own transcript, then ranked by the
module-9 TF-IDF index — so searching "budget" also surfaces "cost" lines.

```
$ python scripts/nlp/word2vec_demo.py

Training Word2Vec (skip-gram) on 10000 Brown sentences...

vector('government') dim=100, first 8 dims:
   [0.006, 0.038, 0.221, 0.229, -0.089, 0.264, -0.064, 0.034]

nearest to 'government':
  policy (0.98), organization (0.97), soviet (0.97), germany (0.96), ...
```

Related terms cluster ("government" → "policy", "organization"); the weaker
neighbours for rarer words ("water" → "traffic") are an honest artifact of the
small 10k-sentence training corpus.

---

## Reproducing everything

```bash
cd server && .venv/Scripts/activate
for s in tokenize normalize keywords parse ngram wordnet nlg translate ir word2vec; do
  python scripts/nlp/${s}_demo.py
done
python scripts/summarize_demo.py
```

All scripts are deterministic apart from Word2Vec training (seeded, but exact
neighbour scores can vary slightly across gensim builds).
