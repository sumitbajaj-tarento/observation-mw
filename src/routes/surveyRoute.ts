const surveyController = require("./../controllers/surveyController");
import { Router } from 'express'
export const surveyRoute = Router();
surveyRoute.get(
    "/getSurveyDetails",
    surveyController.getSurveyDetails
);

