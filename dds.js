(function(exports) {
    "use strict";

    function assert(b) {
        if (!b) XXX;
    }

    function readString(buffer, offs, length) {
        var buf = new Uint8Array(buffer, offs, length);
        var L = new Array(length);
        for (var i = 0; i < length; i++)
            L[i] = String.fromCharCode(buf[i]);
        return L.join('');
    }

    function r5g6b5(dst, dstOffs, pixel) {
        var r, g, b;
        r = (pixel & 0xF100) >> 11;
        g = (pixel & 0x07E0) >> 5;
        b = (pixel & 0x001F);

        // http://www.mindcontrol.org/~hplus/graphics/expand-bits.html
        r = (r << (8 - 5)) | (r >> (10 - 8));
        g = (g << (8 - 6)) | (g >> (12 - 8));
        b = (b << (8 - 5)) | (b >> (10 - 8));

        dst[dstOffs+0] = r;
        dst[dstOffs+1] = g;
        dst[dstOffs+2] = b;
        dst[dstOffs+3] = 0xFF;
    }

    function decodeDXT1(dst, buffer, w, h) {
        var view = new DataView(buffer);

        var offs = 0;
        var colorTable = new Uint8Array(16);
        for (var y = 0; y < h; y += 4) {
            for (var x = 0; x < w; x += 4) {
                var color1 = view.getUint16(offs + 0x00, true);
                var color2 = view.getUint16(offs + 0x02, true);
                var bits = view.getUint32(offs + 0x04, true);
                offs += 8;

                r5g6b5(colorTable, 0, color1);
                r5g6b5(colorTable, 4, color2);

                if (color1 > color2) {
                    colorTable[8+0] = (2*colorTable[0+0] + colorTable[4+0] + 1) / 3;
                    colorTable[8+1] = (2*colorTable[0+1] + colorTable[4+1] + 1) / 3;
                    colorTable[8+2] = (2*colorTable[0+2] + colorTable[4+2] + 1) / 3;
                    colorTable[8+3] = 0xFF;

                    colorTable[12+0] = (colorTable[0+0] + 2*colorTable[4+0] + 1) / 3;
                    colorTable[12+1] = (colorTable[0+1] + 2*colorTable[4+1] + 1) / 3;
                    colorTable[12+2] = (colorTable[0+2] + 2*colorTable[4+2] + 1) / 3;
                    colorTable[12+3] = 0xFF;
                } else {
                    colorTable[8+0] = (colorTable[0+0] + colorTable[4+0] + 1) / 2;
                    colorTable[8+1] = (colorTable[0+1] + colorTable[4+1] + 1) / 2;
                    colorTable[8+2] = (colorTable[0+2] + colorTable[4+2] + 1) / 2;
                    colorTable[8+3] = 0xFF;

                    colorTable[12+0] = 0x00;
                    colorTable[12+1] = 0x00;
                    colorTable[12+2] = 0x00;
                    colorTable[12+3] = 0xFF;
                }

                for (var iy = 0; iy < 4; ++iy) {
                    for (var ix = 0; ix < 4; ++ix) {
                        var di = 4*((y + iy)*w + x + ix);
                        var si = bits & 0x03;
                        dst[di+0] = colorTable[si*4+0];
                        dst[di+1] = colorTable[si*4+1];
                        dst[di+2] = colorTable[si*4+2];
                        dst[di+3] = colorTable[si*4+3];
                        bits >>= 2;
                    }
                }
            }
        }
    }

    function decodeDXT3(dst, buffer, w, h) {
        var view = new DataView(buffer);

        var offs = 0;
        var colorTable = new Uint8Array(16);
        for (var y = 0; y < h; y += 4) {
            for (var x = 0; x < w; x += 4) {
                var alphas = new Uint8Array(buffer, offs, 4);
                offs += 8;
                var color1 = view.getUint16(offs + 0x00, true);
                var color2 = view.getUint16(offs + 0x02, true);
                var bits = view.getUint32(offs + 0x04, true);
                offs += 8;

                r5g6b5(colorTable, 0, color1);
                r5g6b5(colorTable, 4, color2);

                colorTable[8+0] = (colorTable[0+0] + colorTable[4+0] + 1) / 2;
                colorTable[8+1] = (colorTable[0+1] + colorTable[4+1] + 1) / 2;
                colorTable[8+2] = (colorTable[0+2] + colorTable[4+2] + 1) / 2;
                colorTable[12+0] = 0x00;
                colorTable[12+1] = 0x00;
                colorTable[12+2] = 0x00;

                for (var iy = 0; iy < 4; ++iy) {
                    for (var ix = 0; ix < 4; ++ix) {
                        var pi = ((y + iy)*w + x + ix);
                        var di = 4*pi;
                        var si = bits & 0x03;
                        dst[di+0] = colorTable[si*4+0];
                        dst[di+1] = colorTable[si*4+1];
                        dst[di+2] = colorTable[si*4+2];
                        bits >>= 2;

                        var aidx = 7 - (pi >> 2);
                        var alpha;
                        if (pi & 1)
                            dst[di+3] = alphas[aidx] & 0x0F;
                        else
                            dst[di+4] = alphas[aidx] >> 4;
                    }
                }
            }
        }
    }

    function decodeDXT5(dst, buffer, w, h) {
        var view = new DataView(buffer);

        var offs = 0;
        var colorTable = new Uint8Array(16);
        for (var y = 0; y < h; y += 4) {
            for (var x = 0; x < w; x += 4) {
                offs += 8;
                var color1 = view.getUint16(offs + 0x00, true);
                var color2 = view.getUint16(offs + 0x02, true);
                var bits = view.getUint32(offs + 0x04, true);
                offs += 8;

                r5g6b5(colorTable, 0, color1);
                r5g6b5(colorTable, 4, color2);

                colorTable[8+0] = (colorTable[0+0] + colorTable[4+0] + 1) / 2;
                colorTable[8+1] = (colorTable[0+1] + colorTable[4+1] + 1) / 2;
                colorTable[8+2] = (colorTable[0+2] + colorTable[4+2] + 1) / 2;
                colorTable[12+0] = 0x00;
                colorTable[12+1] = 0x00;
                colorTable[12+2] = 0x00;

                for (var iy = 0; iy < 4; ++iy) {
                    for (var ix = 0; ix < 4; ++ix) {
                        var pi = ((y + iy)*w + x + ix);
                        var di = 4*pi;
                        var si = bits & 0x03;
                        dst[di+0] = colorTable[si*4+0];
                        dst[di+1] = colorTable[si*4+1];
                        dst[di+2] = colorTable[si*4+2];
                        // XXX: We don't handle alpha right now...
                        dst[di+3] = 0xFF;
                        bits >>= 2;
                    }
                }
            }
        }

        return offs;
    }

    var DDS = {};

    DDS.parse = function(buffer) {
        var view = new DataView(buffer);
        assert(readString(buffer, 0x00, 0x04) == 'DDS ');
        assert(view.getUint32(0x04, true) == 0x7C);
        var dds = {};

        dds.height = view.getUint32(0x0C, true);
        dds.width = view.getUint32(0x10, true);

        dds.numLevels = view.getUint32(0x1C, true);
        if (dds.numLevels == 0)
            dds.numLevels = 1;

        dds.pixelFormat = view.getUint32(0x4C, true);
        assert(dds.pixelFormat == 0x20);

        dds.format = readString(buffer, 0x54, 0x04);
        assert(dds.format == 'DXT5');

        dds.levels = [];

        var dataOffs = 0x70;
        for (var i = 0; i < dds.numLevels; i++) {
            var levelBuffer = buffer.slice(dataOffs);
            var levelPixels = new Uint8ClampedArray(dds.width * dds.height * 4);
            dataOffs += decodeDXT5(levelPixels, levelBuffer, dds.width, dds.height);
            var level = new ImageData(levelPixels, dds.width, dds.height);
            dds.levels.push(level);
        }

        return dds;
    }

    exports.DDS = DDS;

})(window);
