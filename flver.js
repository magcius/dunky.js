(function(exports) {
    "use strict";

    var FLVER = {};

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

    function read0StringW(buffer, offs) {
        var buf = new Uint16Array(buffer, offs);
        var L = [];
        for (var i = 0; i < 256; i++) {
            var c = buf[i];
            if (!c)
                break;
            L.push(String.fromCharCode(c));
        }
        return L.join('');
    }

    FLVER.StreamDescAttrib = {
        Position:   0,
        BoneIdx:    1,
        BoneWeight: 2,
        Normal:     3,
        UV:         5,
        Bitangent:  6,
        Color:      10,
    };

    function getStreamDescDataSize(dataType) {
        // TODO: Figure out what these data types are.
        switch (dataType) {
        case 17:
        case 19:
        case 21:
            return 4;
        case 22:
        case 26:
            return 8;
        case 2:
        case 18:
        case 20:
        case 23:
        case 24:
        case 25:
            return 12;
        }

        XXX;
    }

    FLVER.parse = function(buffer) {
        var flver = {};

        var view = new DataView(buffer);
        assert(readString(buffer, 0x0, 0x06) == 'FLVER\0');

        var dataOffs = view.getUint32(0x0C, true);
        var dataSize = view.getUint32(0x10, true);

        var hitboxCount = view.getUint32(0x14, true);
        var materialCount = view.getUint32(0x18, true);
        var boneCount = view.getUint32(0x1C, true);
        var vtxInfoCount = view.getUint32(0x20, true);
        var meshCount = view.getUint32(0x24, true);
        var facesetCount = view.getUint32(0x50, true);
        var vtxDescCount = view.getUint32(0x54, true);
        var mtdParamCount = view.getUint32(0x58, true);

        var offs = 0x80;

        function readHitbox() {
            offs += 0x40;
        }

        function readVec3() {
            var L = new Array(3);
            for (var i = 0; i < 3; i++) {
                L[i] = view.getFloat32(offs);
                offs += 0x04;
            }
            return L;
        }

        function lw() {
            return view.getUint32((offs += 0x04) - 0x04, true);
        }

        function readStringW() {
            var stringOffs = lw();
            return read0StringW(buffer, stringOffs);
        }

        function collect(n, f) {
            var L = new Array(n);
            for (var i = 0; i < n; i++)
                L[i] = f();
            return L;
        }

        flver.hitboxes = collect(hitboxCount, readHitbox);

        function readMaterial() {
            var mat = {};
            mat.name = readStringW();
            mat.mtdName = readStringW();

            // Unk.
            offs += 0x18;

            return mat;
        }

        flver.materials = collect(materialCount, readMaterial);

        function readBone() {
            var bone = {};
            bone.translation = readVec3();
            bone.name = readStringW();
            bone.rotation = readVec3();

            bone.parentID = view.getUint16(offs, true);
            offs += 0x02;
            bone.firstChildID = view.getUint16(offs, true);
            offs += 0x02;

            bone.scale = readVec3();

            bone.firstSiblingID = view.getUint16(offs, true);
            offs += 0x02;
            bone.id = view.getUint16(offs, true);
            offs += 0x02;
            offs += 0x50;
            return bone;
        }

        flver.bones = collect(boneCount, readBone);

        var boneStart = 0, facesetStart = 0, vtxInfoStart = 0;
        function readMesh() {
            var mesh = {};
            mesh.flags = lw();
            mesh.materialIdx = lw();

            // Unk.
            offs += 0x08;
            offs += 0x04;

            mesh.boneStart = boneStart;
            mesh.boneCount = lw();
            boneStart += mesh.boneCount;
            // Unk.
            offs += 0x04;
            mesh.boneOffs = lw();
            mesh.facesetStart = facesetStart;
            mesh.facesetCount = lw();
            facesetStart += mesh.facesetCount;
            mesh.facesetOffs = lw();
            mesh.facesetEnd = mesh.facesetStart + mesh.facesetCount;
            mesh.vtxInfoStart = vtxInfoStart;
            mesh.vtxInfoCount = lw();
            vtxInfoStart += mesh.vtxInfoCount;
            mesh.vtxInfoOffs = lw();
            return mesh;
        }

        flver.meshes = collect(meshCount, readMesh);

        function readFaceset() {
            var faceset = {};
            faceset.flags = lw();
            // Primitive type.
            faceset.drawType = view.getUint8(offs);
            // Have only seen tristrip so far.
            assert(faceset.drawType == 1);
            offs += 0x01;
            faceset.culling = view.getUint8(offs);
            offs += 0x01;
            // Pad / unk.
            offs += 0x02;
            faceset.idxCount = lw();
            var bufSize = faceset.idxCount * 2;
            var bufOffs = lw();
            // XXX: We should bind one big buffer instead of uploading separate ones.
            faceset.idxBufferData = new Uint16Array(buffer.slice(dataOffs + bufOffs, dataOffs + bufOffs + bufSize));
            // Unk.
            offs += 0x10;
            return faceset;
        }

        flver.facesets = collect(facesetCount, readFaceset);

        function readVtxInfo() {
            var vtxInfo = {};

            // Unk.
            offs += 0x04;
            vtxInfo.vtxDescIdx = lw();
            // Unk.
            offs += 0x04;
            vtxInfo.vtxCount = lw();
            // Unk.
            offs += 0x08;
            var bufSize = lw();
            var bufOffs = lw();
            vtxInfo.vtxBufferData = new Float32Array(buffer.slice(dataOffs + bufOffs, dataOffs + bufOffs + bufSize));
            return vtxInfo;
        }

        flver.vtxInfos = collect(vtxInfoCount, readVtxInfo);

        var streamDescStart = 0;
        function readVtxDesc() {
            var vtxDesc = {};
            vtxDesc.streamDescStart = streamDescStart;
            vtxDesc.streamDescCount = lw();
            vtxDesc.streamDescEnd = vtxDesc.streamDescStart + vtxDesc.streamDescCount;
            streamDescStart += vtxDesc.streamDescCount;
            // Unk.
            offs += 0x08;
            offs += 0x04;
            return vtxDesc;
        }

        flver.vtxDescs = collect(vtxDescCount, readVtxDesc);

        function readMtdParam() {
            var mtdParam = {};
            mtdParam.value = readStringW();
            mtdParam.name = readStringW();
            // Unk.
            offs += 0x18;
            return mtdParam;
        }

        flver.mtdParams = collect(mtdParamCount, readMtdParam);

        var streamDescCount = 0;
        flver.vtxDescs.forEach(function(v) { streamDescCount += v.streamDescCount; });

        function readStreamDesc() {
            var streamDesc = {};
            // Unk.
            offs += 0x04;
            streamDesc.offset = lw();
            streamDesc.dataType = lw();
            streamDesc.attrib = lw();
            streamDesc.idx = lw();

            streamDesc.size = getStreamDescDataSize(streamDesc.dataType);

            return streamDesc;
        }

        flver.streamDescs = collect(streamDescCount, readStreamDesc);

        return flver;
    };

    exports.FLVER = FLVER;

})(window);
