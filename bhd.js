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

    function Record(file, offs, size, filename) {
        var data = { file: file, offs: offs, size: size, filename: filename };
        data.loadDCX = function() {
            return this.load().then(function(blob) {
                return DCX.decompressBlob(blob);
            });
        };
        data.load = function(localOffs, localSize) {
            localOffs = localOffs || 0;
            localOffs += offs;
            localSize = localSize || size;
            return file.load(localOffs, localSize);
        };
        return data;
    };

    var BHD = {};
    BHD.load = function(dataFile, records, buffer) {
        var view = new DataView(buffer);
        assert(readString(buffer, 0x00, 0x0C) == 'BHF307D7R6\0\0');
        var count = view.getUint32(0x10, true);

        var offs = 0x20;
        for (var i = 0; i < count; i++) {
            // Unk.
            offs += 0x04;
            var recordSize = view.getUint32(offs, true);
            offs += 0x04;
            var recordOffs = view.getUint32(offs, true);
            offs += 0x04;
            var recordHash = view.getUint32(offs, true);
            offs += 0x04;
            var recordFilenameOffs = view.getUint32(offs, true);
            var recordFilename = read0String(buffer, recordFilenameOffs);
            offs += 0x04;
            // Unk.
            offs += 0x04;
            records[recordHash] = Record(dataFile, recordOffs, recordSize, recordFilename);
        }
        return records;
    };

    window.BHD = BHD;

})(window);
