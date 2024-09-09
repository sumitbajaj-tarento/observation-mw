import axios from "axios";
import { logger } from "../utils/logger";
import { requestValidator } from "../utils/requestValidator"
import { MentoringRelationship } from "../models/mentoringRelationshipModel"
import { MentoringObservation } from "../models/mentoringObservationModel"
import { MenteeSubmissionAttempts } from "../models/menteeSubmissionAttemptsModel"

import { Sequelize } from 'sequelize';
import { ObservationData } from "../models/observationMetaModel";

const API_ENDPOINTS = {
    "getObservationDetails": `${process.env.ML_SURVEY_SERVICE_API_BASE}/v1/observations/assessment`,
    "passbookUpdate": `${process.env.HOST}api/user/v1/passbook`,
    "verifyObservationLink": `${process.env.ML_CORE_SERVICE_API_BASE}/v1/solutions/verifyLink`,
    "getSolutionsList": `${process.env.HOST}api/observationmw/v1/observation/getSolutionsList`,
    "verifyOtp": `${process.env.HOST}api/observationmw/v1/otp/verifyOtp`,
    "getEntity": `${process.env.ML_SURVEY_SERVICE_API_BASE}/v1/observations/entities`,
    "submitObservation": `${process.env.ML_SURVEY_SERVICE_API_BASE}/v1/observationSubmissions/update`,
    "addEntityToObservation": `${process.env.ML_SURVEY_SERVICE_API_BASE}/v1/observations/updateEntities`,
    "dbFind": `${process.env.ML_CORE_SERVICE_API_BASE}/v1/admin/dbFind/observationSubmissions`

}
const observationServiceHeaders = (req: any) => {
    return {
        "accept": "application/json",
        "content-type": "application/json",
        "Authorization": process.env.SB_API_KEY,
        "X-authenticated-user-token": req.headers["x-authenticated-user-token"],
        "internal-access-token": process.env.INTERNAL_ACCESS_TOKEN,
    }
}

// Function to handle missing parameters and return an appropriate response
const handleMissingParams = (params: any, input: any, res: any) => {
    const missingParams = requestValidator(params, input);
    if (missingParams.length > 0) {
        logger.info(missingParams, "Paramters missing")
        return res.status(400).json({
            "type": "Failed",
            "error": `Missing parameters: ${missingParams.join(', ')}`
        });
    }
    return false;
};
//Function to get entity ID for the moentor
const getEntitiesForMentor = async (req: any) => {
    try {
        const solution_id = req.body.solution_id;
        const entityData = await axios({
            params: {
                solutionId: solution_id
            },
            headers: observationServiceHeaders(req),
            method: 'GET',
            url: `${API_ENDPOINTS.getEntity}`,
        })
        return entityData;
    } catch (error) {
        logger.error(error, "Something went wrong while getting observation result")
    }

}

const updateMenteeObservationDetails = async (mentoring_relationship_id: string, solution_id: string, details: any) => {
    try {
        logger.info("Inside updateMenteeObservationDetails")
        logger.info(details)
        const observationInstance = await MentoringObservation.findOne({
            where: {
                mentoring_relationship_id,
                solution_id,
            }
        });
        if (observationInstance) {
            await observationInstance.update(details)
            logger.info("DB update successfull for observation submission")
            return true
        } else {
            return false
        }
    } catch (error) {
        logger.info("Something went wrong while updating mentee observation details")
        return false
    }
}
const insertMenteeAttemptDetails = async (mentor_id: string, mentee_id: string, mentoring_relationship_id: string, solution_id: string, submission_id: string, attempt_serial_number: number, user_submission: any, observation_id: string) => {
    try {
        logger.info("Inside insertMenteeAttemptDetails")
        logger.info(mentor_id, mentee_id, mentoring_relationship_id, solution_id, submission_id, attempt_serial_number, user_submission, observation_id)
        const attemptInstance = await MenteeSubmissionAttempts.create({ mentor_id, mentee_id, mentoring_relationship_id, solution_id, submission_id, attempt_serial_number, user_submission, observation_id });
        if (attemptInstance) {
            logger.info("Attempt insertion successfull for observation submission")
            return true
        } else {
            return false
        }
    } catch (error) {
        logger.info("Something went wrong while inserting attempts")
        return false
    }
}
const updateMenteeAttemptDetails = async (submission_id: string, details: any) => {
    logger.info("Inside updateMenteeAttemptDetails")
    const result = await MenteeSubmissionAttempts.update(
        details,
        {
            where: {
                submission_id: submission_id, // replace with the actual submission_id value
            },
        }
    );
    if (result[0] > 0) {
        return true
    } else {
        console.log('No records updated');
    }
}
export const getSolutionsList = async (req: any, res: any) => {
    try {
        const filters = req.body
        logger.info(filters)
        const solutionDetails = await ObservationData.findAll({
            where: filters
        });
        logger.info(solutionDetails)
        res.status(200).json(solutionDetails)
    } catch (error) {
        res.status(400).json(
            { "type": "Failed", "error": "Something went wrong while fetching list of solutions" }
        )
    }

}
export const getMentorAssignedSolutionsList = async (req: any, res: any) => {
    const mentorId = req.query.mentorId;
    MentoringRelationship.hasMany(MentoringObservation, {
        foreignKey: 'mentoring_relationship_id',
    });
    MentoringObservation.hasMany(ObservationData, {
        foreignKey: 'solution_id',
    });
    const solutionsData = await MentoringRelationship.findAll({
        attributes: ['mentoring_relationship_id'],
        include: [
            {
                model: MentoringObservation,
                attributes: ['solution_id',],
                where: { status: "active" },
                include: [{
                    model: ObservationData,
                    as: 'observationData',
                    attributes: ['solution_id', 'solution_name']
                }]
            },
        ],
        where: { mentor_id: mentorId },
        subQuery: false,
    });
    const solutionIdNameMap: { [key: string]: string } = {};
    solutionsData.forEach((item: any) => {
        item.mentoring_observations?.forEach((obs: any) => {
            const solutionId = obs.observationData?.solution_id;
            const solutionName = obs.observationData?.solution_name;
            if (solutionId && solutionName) {
                solutionIdNameMap[solutionId] = solutionName;
            }
        });
    });
    res.status(200).json({ "message": "SUCCESS", solutionsList: solutionIdNameMap }
    )

}
export const updateSubmissionandCompetency = async (req: any, res: any) => {
    try {
        const { mentee_id, solution_id } = req.body;
        //Call solution details API and get the result and update passbook accordingly
        const solutionCompetencyDetails = await axios({
            data: {
                solution_id
            },
            headers: {
                "accept": "application/json",
                "content-type": "application/json",
                "Authorization": process.env.SB_API_KEY,
                "X-authenticated-user-token": req.headers["x-authenticated-user-token"],
            },
            method: 'GET',
            url: `${API_ENDPOINTS.getSolutionsList}`,
        })
        const competencyDetails = solutionCompetencyDetails.data[0].competency_data
        const solutionName = solutionCompetencyDetails.data[0]["solution_name"]
        const solutionId = solutionCompetencyDetails.data[0]["solution_id"]
        for (const competency of competencyDetails) {
            let competencyName = Object.keys(competency)[0]
            let competencyLevelData = Object.values(competency).toString()
            let competencyId = competencyLevelData.substring(0, competencyLevelData.indexOf("-"))
            let competencyLevelId = competencyLevelData.substring(competencyLevelData.indexOf("-") + 1, competencyLevelData.length)
            try {
                const passbookData = await axios({
                    data: {
                        request: {
                            userId: mentee_id,
                            typeName: 'competency',
                            competencyDetails: [
                                {
                                    competencyId: competencyId.toString(),
                                    additionalParams: {
                                        competencyName: competencyName.toString()
                                    },
                                    acquiredDetails: {
                                        acquiredChannel: 'admin',
                                        competencyLevelId: competencyLevelId,
                                        additionalParams: {
                                            competencyName: competencyName,
                                            courseName: "Obs-" + solutionName,
                                            courseId: solutionId,
                                            solutionName: solutionName,
                                            solutionId: solutionId
                                        },
                                    },
                                },
                            ],
                        }
                    },
                    headers: {
                        "accept": "application/json",
                        "content-type": "application/json",
                        "Authorization": process.env.SB_API_KEY,
                        "X-authenticated-user-token": req.headers["x-authenticated-user-token"],
                        "x-authenticated-userid": mentee_id
                    },
                    method: 'PATCH',
                    url: `${API_ENDPOINTS.passbookUpdate}`,
                })
                logger.info("passbook data")
                logger.info(passbookData)
            } catch (error) {
                logger.info("Something went wrong while passbook update")
                return res.status(500).json({ "type": "Failed", "error": "Something went wrong while passbook update" });
            }
        }
        res.status(200).json({
            message: 'Passbook updated successfully',
        });
    } catch (error) {
        res.status(500).json({ "type": "Failed", "error": "Something went wrong while passbook update" });
    }
}
export const menteeConsolidatedObservationAttempts = async (req: any, res: any) => {
    logger.info("Inside menteeConsolidatedObservationAttempts ")
    try {
        const { mentor_id, mentee_id } = req.query

        MenteeSubmissionAttempts.hasOne(ObservationData, {
            foreignKey: 'solution_id',
            sourceKey: 'solution_id',
        });
        const menteeAttemptInstance = await MenteeSubmissionAttempts.findAll({
            where: {
                mentor_id,
                mentee_id
            }, include: [
                {
                    model: ObservationData,
                    as: 'observationAttemptsMetaData',
                    attributes: ['solution_id', 'solution_name', 'competency_data', 'duration']
                },
            ],
        });
        logger.info(menteeAttemptInstance)
        res.status(200).json(menteeAttemptInstance)
    } catch (error) {
        res.status(400).json({
            "message": "Something went wrong while fetching observations"
        })
    }

}
export const menteeConsolidatedObservationAttemptsV2 = async (req: any, res: any) => {
    logger.info("Inside menteeConsolidatedObservationAttempts v2")
    try {
        const { mentorId = "", menteeId = "", solutionId = "", groupBy = "" } = req.query
        const filters = {
            "mentor_id": mentorId,
            "mentee_id": menteeId,
            "solution_id": solutionId
        }
        if (groupBy == "mentee_id") {
            delete filters.mentee_id
        }
        if (groupBy == "solution_id") {
            delete filters.solution_id
        }
        if (!filters.mentor_id) {
            delete filters.mentor_id
        }
        MenteeSubmissionAttempts.hasOne(ObservationData, {
            foreignKey: 'solution_id',
            sourceKey: 'solution_id',
        });
        const menteeAttemptInstance: any = await MenteeSubmissionAttempts.findAll({
            where: filters, include: [
                {
                    model: ObservationData,
                    as: 'observationAttemptsMetaData',
                    attributes: ['solution_id', 'solution_name', 'competency_data', 'duration']
                },
                {
                    model: MentoringRelationship,
                    attributes: ["mentor_name", "mentee_name", "mentee_contact_info"],
                    as: 'attemptsMentoringRelationshipMapping'
                }
            ],
            order: [['createdAt', 'DESC']]
        });
        const result = menteeAttemptInstance.reduce((grouped: any, item: any) => {
            const key = item[groupBy];
            const observation_name = item.observationAttemptsMetaData.solution_name;
            const menteeMentorMeta = item.attemptsMentoringRelationshipMapping
            if (!grouped[key]) {
                grouped[key] = {
                    attempts: [],
                    solution_name: observation_name,
                    mentorMenteeInfo: menteeMentorMeta
                };
            }
            grouped[key].attempts.push(item);
            return grouped;
        }, {});
        res.status(200).json({
            "message": "SUCCESS",
            result
        });
    } catch (error) {
        console.log(error)
        res.status(400).json({
            "message": "Something went wrong while fetching observations"
        })
    }

}
//Function to get result of the submitted observations through DBFind API in ml-core service
export const getObservationSubmissionResult = async (req: any, res: any) => {
    try {
        const submission_id = req.body.submission_id;
        const submissionResult = await axios({
            data: {
                "query": {
                    "_id": submission_id
                },
                "mongoIdKeys": [
                    "_id"
                ],
                "projection": [],
                "limit": 200,
                "skip": 0
            },
            headers: observationServiceHeaders(req),
            method: 'GET',
            url: `${API_ENDPOINTS.dbFind}`,
        })
        logger.info(submissionResult.data.result[0].pointsBasedPercentageScore)


        if (submissionResult) {
            const attemptResultUpdateDetails = {
                result_percentage: Math.round(submissionResult.data.result[0].pointsBasedPercentageScore),
                total_score: Math.round(submissionResult.data.result[0].pointsBasedMaxScore),
                acquired_score: Math.round(submissionResult.data.result[0].pointsBasedScoreAchieved)
            }
            await updateMenteeAttemptDetails(submission_id, attemptResultUpdateDetails)
        }
        res.status(200).json({
            "message": "SUCCESS",
            "data": submissionResult.data
        })
    } catch (error) {
        logger.error(error, "Something went wrong while getting observation result")
        return res.status(500).json({ "type": "Failed", "error": "Something went wrong while getting observation result" });
    }

}
//Function to submit observation
const checkSubmissionEligibilty = async (solution_id: string, mentoring_relationship_id: string, req: any) => {
    const observationInstance: any = await MentoringObservation.findOne({
        where: {
            mentoring_relationship_id,
            solution_id,
        }
    });
    if (observationInstance) {
        const otp_verified_on = observationInstance.otp_verified_on
        const solutionsData = await axios({
            data: {
                "solution_id": solution_id
            },
            headers: observationServiceHeaders(req),
            method: 'GET',
            url: `${API_ENDPOINTS.getSolutionsList}`,
        })
        const duration = solutionsData.data[0].duration
        const submissionTime = Date.now()
        const differenceInSeconds = Math.floor((submissionTime - otp_verified_on.getTime()) / 1000);
        if (differenceInSeconds < duration) {
            return true
        }
    }
    return false
}
export const submitObservation = async (req: any, res: any) => {
    try {
        let { mentee_id, mentor_id, solution_id, submission_id, attempted_count, mentoring_relationship_id, submission_data, observation_id } = req.body;
        if (!observation_id) {
            observation_id = "NA"
        }
        if (!checkSubmissionEligibilty(solution_id, mentoring_relationship_id, req)) {
            return res.status(404).json({
                "message": "Mentee not allowed for submission"
            })
        }
        if (handleMissingParams(["mentee_id", "mentor_id", "solution_id", "submission_id", "attempted_count", "mentoring_relationship_id", "submission_data"], req.body, res)) return;
        const submitObservationDetails = await axios({
            headers: observationServiceHeaders(req),
            method: 'POST',
            data: submission_data,
            url: `${API_ENDPOINTS.submitObservation}/${submission_id}`
        })
        logger.info("submit observation details")
        logger.info(submitObservationDetails.data)
        if (submitObservationDetails) {
            const menteeObservationUpdationStatus = updateMenteeObservationDetails(mentoring_relationship_id, solution_id, {
                attempted_count: Sequelize.literal('"attempted_count" + 1'),
                submission_status: "submitted",
                scheduled_on: null

            })
            logger.info(menteeObservationUpdationStatus)
            const insertionStatus = insertMenteeAttemptDetails(mentor_id, mentee_id, mentoring_relationship_id, solution_id, submission_id, attempted_count, submission_data, observation_id)
            logger.info(insertionStatus)

            if (await menteeObservationUpdationStatus && await insertionStatus) {
                logger.info("inside if")

                return res.status(200).json({
                    "message": "SUCCESS",
                    "data": submitObservationDetails.data
                })
            }
            res.status(400).json({
                "message": "SUCCESS",
                "data": "Something went wrong while submitting observation"
            })
        }

    } catch (error) {
        logger.error(error, "Something went wrong while submitting observation")
        return res.status(500).json({ "type": "Failed", "error": "Something went wrong while submitting observation" });
    }

}
//End-points for verifying observation link
export const verifyobservationLink = async (req: any, res: any) => {
    try {
        logger.info("Inside verify observation link route");
        const observationLink = req.query.observationLink
        if (handleMissingParams(["observationLink"], req.query, res)) return;
        const observationDetails = await axios({
            params: {
                "createProject": "false"
            },
            headers: observationServiceHeaders(req),
            method: 'POST',
            url: `${API_ENDPOINTS.verifyObservationLink}/${observationLink}`,
        })
        res.status(200).json(observationDetails.data)
    } catch (error) {
        logger.error(error, "Something went wrong while verifying observation link")
        return res.status(500).json({ "type": "Failed", "error": "Something went wrong while verifying observation link" });
    }

};
//Function to add entities to the observation
export const addEntityToObservation = async (req: any, res: any) => {
    try {
        const { observation_id, mentee_id } = req.query;
        if (handleMissingParams(["observation_id", "mentee_id"], req.query, res)) return;
        const addEntityDetails = await axios({
            headers: observationServiceHeaders(req),
            data: {
                data: [mentee_id]
            },
            method: 'POST',
            url: `${API_ENDPOINTS.addEntityToObservation}/${observation_id}`,
        })
        res.status(200).json(addEntityDetails.data)
    } catch (error) {
        logger.error(error, "Something went wrong while adding entity to observation")
        return res.status(500).json({ "type": "Failed", "error": "Something went wrong while adding entity to observation" });
    }

}
//Endpoints for getting observation details
export const getobservationDetails = async (req: any, res: any) => {
    try {
        logger.info("Inside observation details route");
        const { observation_id, mentee_id, submission_number } = req.query
        if (handleMissingParams(["observation_id", "mentee_id", "submission_number"], req.query, res)) return;
        const observationDetails = await axios({
            params: {
                "entityId": mentee_id,
                "submissionNumber": submission_number
            },
            headers: observationServiceHeaders(req),
            data: {
                "users": req.mentorId,
                "roles": "MENTOR,MENTEE"
            },
            method: 'POST',
            url: `${API_ENDPOINTS.getObservationDetails}/${observation_id}`,
        })
        res.status(200).json(observationDetails.data)
    } catch (error) {
        logger.error(error, "Something went wrong while fetching observation questions")
        return res.status(500).json({ "type": "Failed", "error": "Something went wrong while fetching observation questions" });
    }

};
export const observationOtpVerification = async (req: any, res: any) => {
    logger.info("Observation verification OTP route");
    try {
        const { otp, mentor_id, mentee_id, solution_id } = req.body;
        if (handleMissingParams(["otp", "mentor_id", "mentee_id", "solution_id"], req.body, res)) return;
        let otpVerified;
        try {
            otpVerified = await axios({
                params: {
                    otp,
                    menteeId: mentee_id
                },
                headers: observationServiceHeaders(req),
                method: 'GET',
                url: `${API_ENDPOINTS.verifyOtp}`,
            })
        } catch (error) {
            logger.error(error, "MSG-91 API issue")
            return res.status(500).json({ "type": "Failed", "error": "Unable to fulfill the verify OTP request due to a third-party API failure." });
        }

        if (otpVerified.data.type == "success") {
            logger.info("OTP verified successfully from msg-91")
            MentoringObservation.belongsTo(MentoringRelationship, {
                foreignKey: 'mentoring_relationship_id',
            });
            const observationInstance = await MentoringObservation.findOne({
                where: {
                    '$mentoring_relationship.mentor_id$': mentor_id,
                    '$mentoring_relationship.mentee_id$': mentee_id,
                    solution_id: solution_id,
                },
                include: [
                    {
                        model: MentoringRelationship,
                        as: 'mentoring_relationship',
                        attributes: [],
                    },
                ],
            });
            if (observationInstance) {
                //Update the observation instance
                const mentorEntityData = await getEntitiesForMentor(req);
                if (!mentorEntityData) {
                    return res.status(400).json({
                        message: 'Mentee Not Found with the respective solution Id',
                    });
                }
                const observation_id = mentorEntityData.data.result["_id"]
                await observationInstance.update({
                    otp_verification_status: 'verified',
                    observation_id: observation_id,
                    otp_verified_on: new Date()

                });
                logger.info("DB update successfull for OTP verification")
                return res.status(200).json({
                    message: 'OTP verification completed successfully',
                    observation_id: observation_id
                });
            } else {
                return res.status(400).json({
                    message: 'Observation not found',
                });
            }
        }
        else if (otpVerified.data.type == "error") {
            res.status(400).json({
                "message": "Please provide correct otp and try again"
            })
        }
    } catch (error) {
        res.status(400).json({
            "message": "Error occurred while observation verification"
        })
    }

}



