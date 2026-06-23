#!/usr/bin/env bash
set -o errexit

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  KICEKO ProjectHub — Build Render"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "==> 1. Installation des dependances..."
pip install -r requirements.txt

echo "==> 2. Fichiers statiques..."
python manage.py collectstatic --no-input

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Build termine avec succes!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"