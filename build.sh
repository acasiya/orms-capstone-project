#!/usr/bin/env bash
set -o errexit

pip install -r requirements.txt

# rapidocr-onnxruntime depends on the full opencv-python, which needs a system
# libGL that hosts like Render don't have — importing cv2 fails at OCR time.
# The headless build is the same cv2 module without the GUI dependency, so swap
# it in (both packages install into the same cv2/ directory, hence the
# uninstall-then-force-reinstall rather than just leaving both).
pip uninstall -y opencv-python
pip install --force-reinstall --no-deps opencv-python-headless==5.0.0.93

python manage.py collectstatic --noinput
python manage.py migrate
