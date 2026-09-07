from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


def suggest_ordinances(query_text, ordinances, limit=3, min_score=0.05):
    """
    Ranks `ordinances` by TF-IDF cosine similarity against `query_text`,
    treating the query as one more "document" in the same vector space as
    the ordinance corpus (title + category + description) — the standard
    vector-space-model approach to query/document similarity.

    Returns a list of (ordinance, score) tuples, highest score first,
    length <= limit, each score >= min_score. Returns [] if there are
    fewer than 2 ordinances (TF-IDF's idf term is degenerate with 0-1
    documents) or if nothing clears min_score.

    Not caching/persisting the fitted vectorizer — the ordinance corpus is
    barangay-scale (tens, not thousands) and changes rarely, so refitting
    per request is a few milliseconds and avoids any stale-cache-after-edit
    bugs.
    """
    ordinances = list(ordinances)
    if len(ordinances) < 2 or not query_text.strip():
        return []

    corpus = [f"{o.title} {o.category} {o.description}" for o in ordinances]
    corpus.append(query_text)

    try:
        matrix = TfidfVectorizer(stop_words="english").fit_transform(corpus)
    except ValueError:
        # Empty vocabulary after stopword removal (e.g. query is all stopwords/punctuation).
        return []

    scores = cosine_similarity(matrix[-1], matrix[:-1])[0]
    ranked = sorted(zip(ordinances, scores), key=lambda pair: pair[1], reverse=True)
    return [(o, float(s)) for o, s in ranked if s >= min_score][:limit]
