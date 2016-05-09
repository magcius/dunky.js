(function(exports) {
    "use strict";

    // XXX: I have no idea what the "real" format is but this seems to be the
    // format of all the .dcx files I can find...

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

    function loadBlob(blob) {
        return new Promise(function(resolve, reject) {
            var reader = new FileReader();
            reader.onload = function() {
                resolve(reader.result);
            };
            reader.readAsArrayBuffer(blob);
        });
    }

    var DCX = {};
    DCX.decompressBuffer = function(buffer) {
        var view = new DataView(buffer);
        assert(readString(buffer, 0x00, 0x04) == 'DCX\0');
        assert(view.getUint32(0x04, true) == 0x0100);
        assert(view.getUint32(0x08, false) == 0x18);
        assert(view.getUint32(0x0C, false) == 0x24);
        assert(view.getUint32(0x10, false) == 0x24);
        assert(view.getUint32(0x14, false) == 0x2C);
        assert(readString(buffer, 0x18, 0x04) == 'DCS\0');
        var uncompressedSize = view.getUint32(0x1C, false);
        var compressedSize = view.getUint32(0x20, false);
        assert(readString(buffer, 0x24, 0x08) == 'DCP\0DFLT');
        assert(view.getUint32(0x2C, false) == 0x20);
        assert(view.getUint32(0x30, true) == 0x09);
        assert(view.getUint32(0x34, true) == 0x00);
        assert(view.getUint32(0x38, true) == 0x00);
        assert(view.getUint32(0x3C, true) == 0x00);
        assert(view.getUint32(0x40, true) == 0x010100);
        assert(readString(buffer, 0x44, 0x04) == 'DCA\0');
        assert(view.getUint32(0x48, false) == 0x08);
        var contents = new Uint8Array(buffer, 0x4C, compressedSize);
        var decompressed = pako.inflate(contents);
        return decompressed.buffer;
    };
    DCX.decompressBlob = function(blob) {
        return loadBlob(blob).then(function(buffer) {
            return DCX.decompressBuffer(buffer);
        });
    };

    exports.DCX = DCX;

})(window);
