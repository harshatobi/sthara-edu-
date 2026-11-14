-- NOT YET APPLIED to the live database (waiting for approval, 2026-11-15).
-- Bank chapter keys follow the app's chapter key (src/lib/teacher/topicKey.ts: lower case, "Ch N" prefix dropped,
-- anything but letters and digits as one space). The CBSE loader had used the mastery engine's key, which keeps
-- punctuation, so questions in "Power-sharing", "Metals and Non-metals" and the like were never picked (2026-11-15).
UPDATE public.bank_items SET chapter_key = k.nk
FROM (SELECT id, trim(regexp_replace(regexp_replace(lower(chapter_key), '^ch(apter)?\s*\d+\s*[·:.-]?\s*', ''), '[^a-z0-9]+', ' ', 'g')) AS nk FROM public.bank_items) k
WHERE k.id = bank_items.id AND k.nk <> '' AND k.nk <> bank_items.chapter_key;
UPDATE public.kb_vectors v SET chapter_key = b.chapter_key FROM public.bank_items b
WHERE v.item_type = 'bank' AND v.item_id = b.id AND v.chapter_key IS DISTINCT FROM b.chapter_key;
