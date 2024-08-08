"use strict";

const fs = require("fs");
const matchDataPath = "match_data/123.json";
const log = require("./logger.js").log;

module.exports = {
    readExcel: function (recievedJSON, callback) {
        let kdData = JSON.parse(
            fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).KDFilePath)
        );
        let vcnvData = JSON.parse(
            fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).VCNVFilePath)
        );
        let ttData = JSON.parse(
            fs.readFileSync(
                JSON.parse(fs.readFileSync(matchDataPath)).TangTocFilePath
            )
        );
        let vdData = JSON.parse(
            fs.readFileSync(
                JSON.parse(fs.readFileSync(matchDataPath)).VedichFilePath
            )
        );
        let chpData = JSON.parse(
            fs.readFileSync(JSON.parse(fs.readFileSync(matchDataPath)).ChpFilePath)
        );
        kdData.questions.singleplayer = [[], [], [], []];
        kdData.questions.multiplayer = [];
        let kdCurrentPlayer = 0;
        let kdQCounter = 0;
        vdData.questions = [];
        for (let i = 3; i <= 26; i++) {
            if (recievedJSON.kd[i].__EMPTY) {
                let question = {};
                question.question = recievedJSON.kd[i].__EMPTY;
                question.answer = recievedJSON.kd[i].__EMPTY_1;
                if (recievedJSON.kd[i].__EMPTY_2) {
                    question.type = "P";
                    question.audioFilePath = recievedJSON.kd[i].__EMPTY_2;
                } else if (recievedJSON.kd[i].__EMPTY_3) {
                    question.type = "A";
                    question.audioFilePath = recievedJSON.kd[i].__EMPTY_2;
                } else {
                    question.type = "N";
                }
                kdData.questions.singleplayer[kdCurrentPlayer].push(question);
                kdQCounter++;
                if (kdQCounter == 6) {
                    kdQCounter = 0;
                    kdCurrentPlayer++;
                }
            }
        }
        for (let i = 29; i <= 40; i++) {
            if (recievedJSON.kd[i].__EMPTY) {
                let question = {};
                question.question = recievedJSON.kd[i].__EMPTY;
                question.answer = recievedJSON.kd[i].__EMPTY_1;
                if (recievedJSON.kd[i].__EMPTY_2) {
                    question.type = "P";
                    question.audioFilePath = recievedJSON.kd[i].__EMPTY_2;
                } else if (recievedJSON.kd[i].__EMPTY_3) {
                    question.type = "A";
                    question.audioFilePath = recievedJSON.kd[i].__EMPTY_2;
                } else {
                    question.type = "N";
                }
                kdData.questions.multiplayer.push(question);
            }
        }

        fs.writeFileSync(
            JSON.parse(fs.readFileSync(matchDataPath)).KDFilePath,
            JSON.stringify(kdData)
        );
        
        log("Hoàn thành nhập đề KD");
        vcnvData.questions[5].answer = recievedJSON.vcnv[1].__EMPTY;
        vcnvData.questions[5].picFileName = recievedJSON.vcnv[1].__EMPTY_2;
        for (let i = 3; i <= 7; i++) {
            vcnvData.questions[i - 3].question = recievedJSON.vcnv[i].__EMPTY;
            vcnvData.questions[i - 3].answer = recievedJSON.vcnv[i].__EMPTY_1;
            vcnvData.questions[i - 3].ifOpen = false;
            vcnvData.questions[i - 3].ifShown = false;
            if (recievedJSON.vcnv[i].__EMPTY_2) {
                vcnvData.questions[i - 3].audioFilePath =
                    recievedJSON.vcnv[i].__EMPTY_2;
                vcnvData.questions[i - 3].type = "HN_S";
            } else {
                vcnvData.questions[i - 3].type = "HN";
            }
        }
        fs.writeFileSync(
            JSON.parse(fs.readFileSync(matchDataPath)).VCNVFilePath,
            JSON.stringify(vcnvData)
        );
        
        log("Hoàn thành nhập đề VCNV");
        for (let i = 0; i <= 3; i++) {
            if (
                recievedJSON.tt[i + 2].__EMPTY &&
                recievedJSON.tt[i + 2].__EMPTY_1
            ) {
                ttData.questions[i].question = recievedJSON.tt[i + 2].__EMPTY;
                ttData.questions[i].answer = recievedJSON.tt[i + 2].__EMPTY_1;
                if (i < 3) {
                    ttData.questions[i].type = "TT_IMG";
                    ttData.questions[i].question_image =
                        recievedJSON.tt[i + 2].__EMPTY_2;
                    if (recievedJSON.tt[i + 2].__EMPTY_3) {
                        ttData.questions[i].answer_image =
                            recievedJSON.tt[i + 2].__EMPTY_3;
                    }
                } else {
                    ttData.questions[i].video_name = recievedJSON.tt[i + 2].__EMPTY_2;
                    ttData.questions[i].type = "TT_VD";
                }
            }
        }

        fs.writeFileSync(
            JSON.parse(fs.readFileSync(matchDataPath)).TangTocFilePath,
            JSON.stringify(ttData)
        );
        
        log("Hoàn thành nhập đề tăng tốc");
        for (let i = 3; i <= 8; i++) {
            vdData.questionPools[0][i - 3].question = recievedJSON.vd[i].__EMPTY;
            vdData.questionPools[0][i - 3].answer = recievedJSON.vd[i].__EMPTY_1;
            if (recievedJSON.vd[i]["VỀ ĐÍCH"] == "Câu hỏi 20 điểm") {
                vdData.questionPools[0][i - 3].value = 20;
            } else {
                vdData.questionPools[0][i - 3].value = 30;
            }
            if (recievedJSON.vd[i].__EMPTY_2) {
                vdData.questionPools[0][i - 3].type = "V";
                vdData.questionPools[0][i - 3].file_name =
                    recievedJSON.vd[i].__EMPTY_2;
            } else if (recievedJSON.vd[i].__EMPTY_3) {
                vdData.questionPools[0][i - 3].type = "I";
                vdData.questionPools[0][i - 3].file_name =
                    recievedJSON.vd[i].__EMPTY_3;
            } else if (recievedJSON.vd[i].__EMPTY_4) {
                vdData.questionPools[0][i - 3].type = "A";
                vdData.questionPools[0][i - 3].file_name =
                    recievedJSON.vd[i].__EMPTY_4;
            } else {
                vdData.questionPools[0][i - 3].type = "N";
            }
        }
        for (let i = 11; i <= 16; i++) {
            vdData.questionPools[1][i - 11].question = recievedJSON.vd[i].__EMPTY;
            vdData.questionPools[1][i - 11].answer = recievedJSON.vd[i].__EMPTY_1;
            if (recievedJSON.vd[i]["VỀ ĐÍCH"] == "Câu hỏi 20 điểm") {
                vdData.questionPools[1][i - 11].value = 20;
            } else {
                vdData.questionPools[1][i - 11].value = 30;
            }
            if (recievedJSON.vd[i].__EMPTY_2) {
                vdData.questionPools[1][i - 11].type = "V";
                vdData.questionPools[1][i - 11].file_name =
                    recievedJSON.vd[i].__EMPTY_2;
            } else if (recievedJSON.vd[i].__EMPTY_3) {
                vdData.questionPools[1][i - 11].type = "I";
                vdData.questionPools[1][i - 11].file_name =
                    recievedJSON.vd[i].__EMPTY_3;
            } else if (recievedJSON.vd[i].__EMPTY_4) {
                vdData.questionPools[1][i - 11].type = "A";
                vdData.questionPools[1][i - 11].file_name =
                    recievedJSON.vd[i].__EMPTY_4;
            } else {
                vdData.questionPools[1][i - 11].type = "N";
            }
        }
        for (let i = 19; i <= 24; i++) {
            vdData.questionPools[2][i - 19].question = recievedJSON.vd[i].__EMPTY;
            vdData.questionPools[2][i - 19].answer = recievedJSON.vd[i].__EMPTY_1;
            if (recievedJSON.vd[i]["VỀ ĐÍCH"] == "Câu hỏi 20 điểm") {
                vdData.questionPools[2][i - 19].value = 20;
            } else {
                vdData.questionPools[2][i - 19].value = 30;
            }
            if (recievedJSON.vd[i].__EMPTY_2) {
                vdData.questionPools[2][i - 19].type = "V";
                vdData.questionPools[2][i - 19].file_name =
                    recievedJSON.vd[i].__EMPTY_2;
            } else if (recievedJSON.vd[i].__EMPTY_3) {
                vdData.questionPools[2][i - 19].type = "I";
                vdData.questionPools[2][i - 19].file_name =
                    recievedJSON.vd[i].__EMPTY_3;
            } else if (recievedJSON.vd[i].__EMPTY_4) {
                vdData.questionPools[2][i - 19].type = "A";
                vdData.questionPools[2][i - 19].file_name =
                    recievedJSON.vd[i].__EMPTY_4;
            } else {
                vdData.questionPools[2][i - 19].type = "N";
            }
        }
        for (let i = 27; i <= 32; i++) {
            vdData.questionPools[3][i - 27].question = recievedJSON.vd[i].__EMPTY;
            vdData.questionPools[3][i - 27].answer = recievedJSON.vd[i].__EMPTY_1;
            if (recievedJSON.vd[i]["VỀ ĐÍCH"] == "Câu hỏi 20 điểm") {
                vdData.questionPools[3][i - 27].value = 20;
            } else {
                vdData.questionPools[3][i - 27].value = 30;
            }
            if (recievedJSON.vd[i].__EMPTY_2) {
                vdData.questionPools[3][i - 27].type = "V";
                vdData.questionPools[3][i - 27].file_name =
                    recievedJSON.vd[i].__EMPTY_2;
            } else if (recievedJSON.vd[i].__EMPTY_3) {
                vdData.questionPools[3][i - 27].type = "I";
                vdData.questionPools[3][i - 27].file_name =
                    recievedJSON.vd[i].__EMPTY_3;
            } else if (recievedJSON.vd[i].__EMPTY_4) {
                vdData.questionPools[3][i - 27].type = "A";
                vdData.questionPools[3][i - 27].file_name =
                    recievedJSON.vd[i].__EMPTY_4;
            } else {
                vdData.questionPools[3][i - 27].type = "N";
            }
        }
        fs.writeFileSync(
            JSON.parse(fs.readFileSync(matchDataPath)).VedichFilePath,
            JSON.stringify(vdData)
        );
        
        for (let i = 35; i <= 37; i++) {
            if (recievedJSON.vd[i].__EMPTY && recievedJSON.vd[i].__EMPTY_1) {
                chpData.questions[i - 35].question = recievedJSON.vd[i].__EMPTY;
                chpData.questions[i - 35].answer = recievedJSON.vd[i].__EMPTY_1;
            }
        }
        fs.writeFileSync(
            JSON.parse(fs.readFileSync(matchDataPath)).ChpFilePath,
            JSON.stringify(chpData)
        );
        log("Hoàn thành nhập đề Về đích & CHP");
        log("Hoàn thành nhập từ file excel");
        return [kdData, vcnvData, ttData, vdData, chpData];
    }

}