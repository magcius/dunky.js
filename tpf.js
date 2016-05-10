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

    function read0String(buffer, offs) {
        var buf = new Uint8Array(buffer, offs);
        var L = [];
        for (var i = 0; i < 256; i++) {
            var c = buf[i];
            if (!c)
                break;
            L.push(String.fromCharCode(c));
        }
        return L.join('');
    }

    function Texture(name, data, flags) {
        this.name = name;
        this.data = data;
        this.flags = flags;
    }

    function TPF() {
        this.textures = [];
        this.texturesByName = {};
    }

    TPF.parse = function(buffer) {
        var tpf = new TPF();

        var view = new DataView(buffer);
        assert(readString(buffer, 0x00, 0x04) == 'TPF\0');

        var count = view.getUint32(0x08, true);

        var offs = 0x10;
        for (var i = 0; i < count; i++) {
            var dataOffs = view.getUint32(offs, true);
            offs += 0x04;
            var size = view.getUint32(offs, true);
            offs += 0x04;
            var flags = view.getUint32(offs, true);
            offs += 0x04;
            var nameOffs = view.getUint32(offs, true);
            offs += 0x04;
            // Unk.
            offs += 0x04;

            var name = read0String(buffer, nameOffs);
            var data = buffer.slice(dataOffs, dataOffs + size);

            var texture = new Texture(name, data, flags);
            tpf.textures.push(texture);
            tpf.texturesByName[name] = texture;
        }
        return tpf;
    };

    exports.TPF = TPF;

})(window);
