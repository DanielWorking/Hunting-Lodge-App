const cron = require("node-cron");
const Group = require("../models/Group");
const ShiftReport = require("../models/ShiftReport");
const ShiftSchedule = require("../models/ShiftSchedule");
const User = require("../models/User");

// הגדרת ה-Cron Job לרוץ כל דקה
cron.schedule("* * * * *", async () => {
    try {
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();

        // המרה של השעה הנוכחית לדקות
        const currentTimeVal = currentHour * 60 + currentMinute;

        const groups = await Group.find({});

        for (const group of groups) {
            if (!group.settings || !group.settings.timeSlots) continue;

            for (const slot of group.settings.timeSlots) {
                const [slotHour, slotMinute] = slot.startTime
                    .split(":")
                    .map(Number);
                const slotTimeVal = slotHour * 60 + slotMinute;

                // בדיקה אם הזמן הנוכחי תואם לזמן המשמרת (טווח של דקה אחת)
                if (Math.abs(slotTimeVal - currentTimeVal) <= 1) {
                    // --- חישוב תאריכי התחלה וסיום מלאים ---
                    const shiftStart = new Date(now);
                    shiftStart.setHours(slotHour, slotMinute, 0, 0);

                    const [endH, endM] = slot.endTime.split(":").map(Number);
                    const shiftEnd = new Date(now);
                    shiftEnd.setHours(endH, endM, 0, 0);

                    // טיפול במקרה שהמשמרת מסתיימת ביום למחרת
                    if (shiftEnd < shiftStart) {
                        shiftEnd.setDate(shiftEnd.getDate() + 1);
                    }

                    // עיצוב תאריך לכותרת
                    const formattedDate = now
                        .toLocaleDateString("he-IL", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                        })
                        .replace(/\./g, "/");

                    const reportTitle = `${slot.name} - ${formattedDate}`;

                    // בדיקה האם כבר קיים דוח כזה (לפי כותרת וקבוצה)
                    // שיניתי את הבדיקה כדי שתהיה אמינה יותר
                    const existingReport = await ShiftReport.findOne({
                        groupId: group._id,
                        title: reportTitle,
                    });

                    if (!existingReport) {
                        console.log(
                            `[Cron] Creating auto-report for group: ${group.name}, shift: ${slot.name}`,
                        );

                        // שליפת משימות קודמות
                        const lastReport = await ShiftReport.findOne({
                            groupId: group._id,
                        }).sort({ startTime: -1 }); // המיון יעבוד כעת נכון כי נשמור ISO

                        const previousTasks = lastReport
                            ? lastReport.currentTasks
                            : "";

                        let attendees = [];

                        // שליפת משתמשים מלוח המשמרות
                        const schedule = await ShiftSchedule.findOne({
                            groupId: group._id,
                            isPublished: true,
                            startDate: { $lte: now },
                            endDate: { $gte: now },
                        });

                        if (schedule) {
                            const relevantShiftTypeIds =
                                slot.linkedShiftTypes || [];

                            const shiftsToday = schedule.shifts.filter((s) => {
                                const isSameDate =
                                    new Date(s.date).toDateString() ===
                                    now.toDateString();
                                const isRelevantType =
                                    relevantShiftTypeIds.includes(
                                        s.shiftTypeId.toString(),
                                    );
                                return isSameDate && isRelevantType;
                            });

                            const userIds = shiftsToday.map((s) => s.userId);
                            const users = await User.find({
                                _id: { $in: userIds },
                            });

                            attendees = users.map((u) => ({
                                userId: u._id,
                                name: u.username,
                                isManual: false,
                            }));
                        }

                        // יצירת הדוח ושמירתו
                        const newReport = new ShiftReport({
                            groupId: group._id,
                            title: reportTitle,
                            date: now,
                            startTime: shiftStart.toISOString(), // שמירה כפורמט ISO תקין!
                            endTime: shiftEnd.toISOString(), // שמירה כפורמט ISO תקין!
                            previousTasks: previousTasks,
                            attendees: attendees,
                            currentTasks: "",
                            isLocked: false,
                        });

                        await newReport.save();
                        console.log(
                            `[Cron] Successfully saved new report for ${group.name}`,
                        );
                    }
                }
            }
        }
    } catch (error) {
        console.error("[Cron] Error generating shift reports:", error);
    }
});
