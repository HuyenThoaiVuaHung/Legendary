function provideNewMatchData() {
    return {

        "matchName": "Legendary",
        "matchPos": "H",
        "players": [
            { "id": 1, "name": "Lê Nguyễn Huy Hoàng", "score": 40, "isReady": false },
            { "id": 2, "name": "Dương Tiến Hải", "score": 300, "isReady": false },
            { "id": 3, "name": "Trịnh Long Vũ", "score": 0, "isReady": false },
            { "id": 4, "name": "Nguyễn Phúc Sang", "score": 0, "isReady": false }
        ],
        "KDFilePath": "match_data/round_data/kd_1.json",
        "VCNVFilePath": "match_data/round_data/vcnv_1.json",
        "TangTocFilePath": "match_data/round_data/tt_1.json",
        "VedichFilePath": "match_data/round_data/vd_1.json",
        "ChpFilePath": "match_data/round_data/chp_1.json",
        "pauseTime": 0
    }
}


module.exports = {
    provideNewMatchData
}