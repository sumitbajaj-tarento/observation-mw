import { Op } from "sequelize";
import { MentoringObservation } from "../models/mentoringObservationModel";
import { MentoringRelationship } from "../models/mentoringRelationshipModel";
import { logger } from "../utils/logger";
import { ObservationData } from "../models/observationMetaModel";

type MentorMenteeSolutionsData = {
    mentorId: string;
    menteeId: string;
    solutionId: string;
    scheduledOn: Date;
    status: string;
};
// tslint:disable-next-line: no-any
export const scheduleObservation = async (req: any, res: any) => {
    try {
        logger.info("Schedule observation API")
        const mentorMenteeSolutionsArray: MentorMenteeSolutionsData[] = req.body.solutionsList;
        let scheduleStatus: MentorMenteeSolutionsData[] = []
        for (const element of mentorMenteeSolutionsArray) {
            MentoringObservation.belongsTo(MentoringRelationship, {
                foreignKey: 'mentoring_relationship_id',
            });
            const observationInstance = await MentoringObservation.findOne({
                where: {
                    '$mentoring_relationship.mentor_id$': element.mentorId,
                    '$mentoring_relationship.mentee_id$': element.menteeId,
                    solution_id: element.solutionId,
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
                await observationInstance.update({
                    scheduled_on: element.scheduledOn,
                    submission_status: ""
                });
                element.status = "SUCCESSFUL"
                scheduleStatus.push(element)
            } else {
                element.status = "FAILED"
                scheduleStatus.push(element)

            }
        }
        res.status(200).json({
            "message": "SUCCESS",
            "solutionsList": scheduleStatus
        })
    } catch (error) {
        logger.info(error)
        res.status(500).json({
            message: "Something went wrong while scheduling observations",
        });
    }
}
export const getScheduledObservationList = async (req: any, res: any) => {
    try {
        const mentorId = req.query.mentorId || "";
        const menteeId = req.query.menteeId || "";
        const filters = {
            "mentor_id": mentorId,
            "mentee_id": menteeId,
        }
        if (!filters.mentor_id) {
            delete filters.mentor_id
        }
        if (!filters.mentee_id) {
            delete filters.mentee_id
        }
        MentoringRelationship.hasMany(MentoringObservation, {
            foreignKey: 'mentoring_relationship_id',
        });
        const daysRange = 7;
        const day = new Date();
        const today = new Date(day.toISOString().split('T')[0] + 'T00:00:00.000Z');
        const daysBefore = new Date(today);
        daysBefore.setDate(today.getDate() - daysRange);
        const daysAfter = new Date(today);
        daysAfter.setDate(today.getDate() + daysRange);
        // const queryFilter: any = {
        //     "sameDay": {
        //         [Op.between]: [today, today.setDate(today.getDate()) + 1]
        //     },
        //     "overdue": {
        //         [Op.between]: [daysBefore, today.setDate(today.getDate()) - 1],
        //     },
        //     "upcoming": {
        //         [Op.between]: [today.setDate(today.getDate()) + 1, daysAfter],
        //     }
        // }
        const queryFilter: any = {
            "sameDay": {
                [Op.between]: [today, new Date(today.getTime() + 24 * 60 * 60 * 1000)]
            },
            "overdue": {
                [Op.between]: [daysBefore, new Date(today.getTime() - 24 * 60 * 60 * 1000)]
            },
            "upcoming": {
                [Op.between]: [new Date(today.getTime() + 24 * 60 * 60 * 1000), daysAfter]
            }
        };
        const scheduledSolutionsList: any = []
        const filterArray = ["sameDay", "overdue", "upcoming"]
        for (const element of filterArray) {
            const menteeObservationData = await MentoringRelationship.findAll({
                attributes: ['mentoring_relationship_id', 'mentor_id', 'mentee_id', 'mentor_name', 'mentee_name', 'mentee_designation', 'mentee_contact_info'],
                include: [
                    {
                        model: MentoringObservation,
                        attributes: ['type','status', 'observation_id', 'solution_id', 'scheduled_on', 'attempted_count',],
                        where: {
                            scheduled_on: queryFilter[element],
                            status:"active",
                            submission_status: ""
                        },
                        include: [{
                            model: ObservationData,
                            as: 'observationData',
                            attributes: ['solution_id', 'solution_name', 'competency_data', 'duration']
                        }]
                    },

                ],
                where: filters,
                subQuery: false,
            });
            scheduledSolutionsList.push({ [element]: menteeObservationData })
        }

        res.status(200).json(scheduledSolutionsList)
    } catch (error) {
        res.status(500).json({
            message: "Something went wrong while fetching observations",
        });
    }

}
module.exports = { scheduleObservation, getScheduledObservationList }
