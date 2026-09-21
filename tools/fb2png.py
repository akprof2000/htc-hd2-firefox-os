"""Кадровый буфер HD2 (32 бита, 480 точек в строке) -> PNG без сторонних библиотек."""
import struct
import sys
import zlib

src, dst, y_offset = sys.argv[1], sys.argv[2], int(sys.argv[3])
order = sys.argv[4] if len(sys.argv) > 4 else "rgba"   # порядок байтов в точке

W, H, STRIDE = 480, 800, 1920
raw = open(src, "rb").read()

rows = bytearray()
for y in range(H):
    start = (y_offset + y) * STRIDE
    line = raw[start:start + W * 4]
    rows.append(0)  # фильтр строки PNG: нет
    for x in range(W):
        a, b, c = line[x * 4], line[x * 4 + 1], line[x * 4 + 2]
        rows += bytes((a, b, c)) if order == "rgba" else bytes((c, b, a))

def chunk(tag, data):
    return (struct.pack(">I", len(data)) + tag + data +
            struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

png = (b"\x89PNG\r\n\x1a\n" +
       chunk(b"IHDR", struct.pack(">IIBBBBB", W, H, 8, 2, 0, 0, 0)) +
       chunk(b"IDAT", zlib.compress(bytes(rows), 9)) +
       chunk(b"IEND", b""))
open(dst, "wb").write(png)
print(dst, len(png), "байт")
