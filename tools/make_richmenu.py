# 產生三個分頁圖文選單的圖片（開發用，不會在 Vercel 上執行）。
# 用法：python3 tools/make_richmenu.py   （需要 Pillow、文泉驛正黑、Noto Color Emoji）
# 改了格子的文字或順序，要同步改 api/setup/richmenu.js 的 TABS。
from PIL import Image, ImageDraw, ImageFont
import os

W, H, BAR = 2500, 843, 130
COLS, ROWS = 4, 2
GAP = 14
DEEP, GREEN, TINT, BG, INK, SOFT = '#16513d', '#2e9d63', '#e2f6e9', '#f1f6f3', '#1b2420', '#6b7a72'
TABS = ['交辦', '查看', '更多']
# 每格：(emoji, 文字, 是不是會再跳出下一步的「›」, 是否為主要格子)
CELLS = [
    [('⏰', '提醒', 0, 0), ('✅', '待辦', 0, 0), ('📝', '筆記', 0, 0), ('🎤', '用講的', 0, 1),
     ('🧾', '記帳', 0, 0), ('📷', '傳照片', 0, 0), ('🔗', '收藏', 0, 0), ('📋', '會議', 0, 0)],
    [('☀️', '今天', 0, 1), ('📅', '本週', 1, 0), ('🗂', '全部待辦', 1, 0), ('🗓', '日曆', 1, 0),
     ('🔍', '搜尋', 0, 0), ('⛪', '服事表', 1, 0), ('📊', '週報', 1, 0), ('🖥', '後台', 0, 0)],
    [('🎵', '詩歌庫', 1, 0), ('📑', '敬拜順序', 1, 0), ('📌', '主題', 1, 0), ('🗃', '專案', 1, 0),
     ('❓', '說明', 1, 0), ('🧾', '本月花費', 1, 0), ('🔊', '語音測試', 0, 0), ('⚙️', '設定', 0, 0)],
]
cjk = lambda s: ImageFont.truetype('/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', s)
emoji = ImageFont.truetype('/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf', 109)


def draw_emoji(img, ch, cx, cy, size=104):
    tmp = Image.new('RGBA', (136, 128), (0, 0, 0, 0))
    ImageDraw.Draw(tmp).text((0, 0), ch, font=emoji, embedded_color=True)
    tmp = tmp.crop(tmp.getbbox() or (0, 0, 1, 1)).resize((size, int(size * tmp.height / max(tmp.width, 1))))
    img.paste(tmp, (cx - tmp.width // 2, cy - tmp.height // 2), tmp)


def build(tab):
    img = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(img)
    tw = W // 3
    for i, name in enumerate(TABS):
        on = i == tab
        d.rectangle([i * tw, 0, (i + 1) * tw - 1, BAR], fill=DEEP if on else '#dfeae4')
        f = cjk(58)
        w = d.textlength(name, font=f)
        d.text((i * tw + (tw - w) / 2, (BAR - 58) / 2 - 6), name, font=f, fill='#ffffff' if on else DEEP)
    cw = (W - GAP * (COLS + 1)) // COLS
    ch = (H - BAR - GAP * (ROWS + 1)) // ROWS
    for k, (em, label, arrow, primary) in enumerate(CELLS[tab]):
        r, c = divmod(k, COLS)
        x = GAP + c * (cw + GAP)
        y = BAR + GAP + r * (ch + GAP)
        d.rounded_rectangle([x, y, x + cw, y + ch], 36, fill=GREEN if primary else '#ffffff')
        draw_emoji(img, em, x + cw // 2, y + ch // 2 - 48)
        f = cjk(60)
        w = d.textlength(label, font=f)
        total = w + (46 if arrow else 0)
        tx = x + (cw - total) / 2
        col = '#ffffff' if primary else INK
        d.text((tx, y + ch - 112), label, font=f, fill=col)
        if arrow:  # 字型沒有「›」，用線條畫
            ax, ay = tx + w + 14, y + ch - 82
            d.line([(ax, ay - 16), (ax + 14, ay), (ax, ay + 16)], fill=GREEN if not primary else col, width=7, joint='curve')
    return img


out = os.path.join(os.path.dirname(__file__), '..', 'assets', 'richmenu')
for t in range(3):
    build(t).save(os.path.join(out, f'tab{t + 1}.png'), optimize=True)
    print('tab', t + 1, os.path.getsize(os.path.join(out, f'tab{t + 1}.png')) // 1024, 'KB')
