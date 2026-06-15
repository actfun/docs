import { Router, type IRouter } from "express";
import healthRouter from "./health";
import liveRouter from "./live";
import shareRouter from "./share";
import eventsRouter from "./events";
import leaderboardRouter from "./leaderboard";
import statsRouter from "./stats";
const router: IRouter = Router();

router.use(healthRouter);
router.use(liveRouter);
router.use(shareRouter);
router.use(eventsRouter);
router.use(leaderboardRouter);
router.use(statsRouter);

export default router;
