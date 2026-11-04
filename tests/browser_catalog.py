"""Chromium check against a local Worker only. Fixture data stays in the local D1.
Usage: python tests/browser_catalog.py http://127.0.0.1:8787
"""
from pathlib import Path
import sys
from playwright.sync_api import sync_playwright,expect

base=sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:8787'
assert base.startswith(('http://127.0.0.1:','http://localhost:')),'Local worker only'
screens=Path(__file__).resolve().parents[1]/'docs'/'screenshots';screens.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1440,'height':1000});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(base);page.locator('#products .card').first.wait_for();expect(page.locator('#products')).to_contain_text('125.00 USD');expect(page.locator('#products')).not_to_contain_text('so‘m')
    page.screenshot(path=str(screens/'catalog-desktop.png'),full_page=True)
    page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(screens/'catalog-mobile.png'),full_page=True)
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'),'Mobile document overflow'
    page.locator('[data-lang="ru"]').first.click();expect(page.locator('#products')).to_contain_text('Цена по запросу')
    expect(page.locator('#products')).to_contain_text('125.00 USD')
    assert not errors,errors
    browser.close()
print('Catalog Chromium: desktop/mobile, USD cents, unknown price RU, responsive layout passed')
