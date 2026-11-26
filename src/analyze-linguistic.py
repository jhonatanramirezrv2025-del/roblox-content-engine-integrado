
import sys
import json
import re
import stanza

nlp = stanza.Pipeline(
    lang="es",
    processors="tokenize,pos,lemma,depparse",
    use_gpu=False,
    verbose=False
)

COHESIVE_DEPENDENCIES = {
    "det", "amod", "case", "fixed", "flat",
    "compound", "nummod", "aux", "cop", "mark"
}



def analyze_sentence(sentence, original_text):
    words = sentence.words

    # Obtener el fragmento exacto de la oración dentro del texto original.
    if not sentence.tokens:
        return {
            "text": sentence.text,
            "forbidden_boundaries": [],
            "analysis": []
        }

    sentence_start = sentence.tokens[0].start_char
    sentence_end = sentence.tokens[-1].end_char

    local_text = original_text[sentence_start:sentence_end]

    # Palabras separadas por espacios dentro de esta oración.
    chunks = list(re.finditer(r"\S+", local_text))

    word_to_chunk = {}

    for token in sentence.tokens:
        local_start = token.start_char - sentence_start
        local_end = token.end_char - sentence_start

        for index, chunk in enumerate(chunks):
            if (
                chunk.start() < local_end
                and chunk.end() > local_start
            ):
                for word in token.words:
                    if isinstance(word.id, int):
                        word_to_chunk[word.id] = index
                break

    forbidden_boundaries = set()

    for word in words:
        if word.deprel not in COHESIVE_DEPENDENCIES:
            continue

        if word.head == 0:
            continue

        child_chunk = word_to_chunk.get(word.id)
        head_chunk = word_to_chunk.get(word.head)

        if child_chunk is None or head_chunk is None:
            continue

        start = min(child_chunk, head_chunk)
        end = max(child_chunk, head_chunk)

        for boundary in range(start + 1, end + 1):
            forbidden_boundaries.add(boundary)

    return {
        "text": local_text,
        "forbidden_boundaries": sorted(forbidden_boundaries),
        "analysis": [
            {
                "word": word.text,
                "pos": word.upos,
                "dependency": word.deprel,
                "head": word.head
            }
            for word in words
        ]
    }



def main():
    if len(sys.argv) < 2:
        print(json.dumps({
            "error": "Debes proporcionar un texto."
        }, ensure_ascii=False))
        sys.exit(1)

    original_text = " ".join(sys.argv[1:])
    doc = nlp(original_text)

    result = {
        "sentences": [
            analyze_sentence(sentence, original_text)
            for sentence in doc.sentences
        ]
    }

    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
