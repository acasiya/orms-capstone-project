"""
extraction.py's OCR guesser's reference list — NOT the live category list
Upload Ordinance's Category dropdown offers. That list is now admin-editable
(see the OrdinanceCategory model and migration 0006's seed data, which
started from this same set) rather than fixed in code, per the request that
adding a category shouldn't need a developer/redeploy.

This module stays only so ordinances/tests.py can assert extraction.py's
_CATEGORY_KEYWORDS table never guesses a name outside this starting set —
a guess for a category an Administrator has since renamed or removed just
won't match any current <option> and the field is left blank, same as any
other OCR guess that doesn't pan out.
"""

ORDINANCE_CATEGORIES = [
    "Health",
    "Environment and Sanitation",
    "Peace and Order",
    "Traffic and Transportation",
    "Public Safety",
    "Youth and Education",
    "Social Welfare",
    "Land Use and Housing",
    "Finance and Taxation",
    "Local Governance",
    "Other",
]
