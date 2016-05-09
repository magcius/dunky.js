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

    function Record(file, offs, size) {
        var data = { file: file, offs: offs, size: size };
        data.loadDCX = function() {
            return this.load().then(function(blob) {
                return DCX.decompressBlob(blob);
            });
        };
        data.load = function() {
            return file.load(offs, size);
        };
        return data;
    };

    var BHD5 = {};
    BHD5.load = function(dataFile, records, buffer) {
        var view = new DataView(buffer);
        assert(readString(buffer, 0x00, 0x04) == 'BHD5');
        assert(view.getUint32(0x04, true) == 0x000000FF);
        assert(view.getUint32(0x08, true) == 0x00000001);

        var unk1 = view.getUint32(0x0C, true); // Seems related to fize size?
        var groupTableCount  = view.getUint32(0x10, true);
        var groupTableOffset = view.getUint32(0x14, true);

        // XXX: Seems the file is divided up into a number of groups?
        // This is probably for some DVD balancing nonsense.
        var gOffs = groupTableOffset;
        for (var i = 0; i < groupTableCount; i++) {
            var recordTableCount = view.getUint32(gOffs, true);
            gOffs += 0x04;
            var recordTableOffset = view.getUint32(gOffs, true);
            gOffs += 0x04;

            // Now iterate through each record in the group and add it to
            // a table...
            var rOffs = recordTableOffset;
            for (var j = 0; j < recordTableCount; j++) {
                var recordHash = view.getUint32(rOffs, true);
                rOffs += 0x04;
                var recordSize = view.getUint32(rOffs, true);
                rOffs += 0x04;
                var recordOffset = view.getUint32(rOffs, true);
                rOffs += 0x04;
                assert (view.getUint32(rOffs, true) == 0x00000000);
                rOffs += 0x04;

                records[recordHash] = Record(dataFile, recordOffset, recordSize);
            }
        }
    };

    window.BHD5 = BHD5;

})(window);
