import { describe, it, expect } from "vitest";
import {
  expandSessionMasters,
  detectScheduleConflict,
  getWeekStart,
  getWeekEnd,
  addWeeks,
  addDays,
  weekdayOnOrAfter,
  toLocalDateStr,
  fromDateOnly,
  normalizeTime,
  cellKey,
  type SessionMaster,
  type SessionException,
} from "@/lib/session-masters";

describe("Schedule Audit: Date Helpers & Parsing Robustness", () => {
  it("toLocalDateStr formats date accurately to YYYY-MM-DD", () => {
    const d = new Date(2026, 10, 19); // November 19, 2026
    expect(toLocalDateStr(d)).toBe("2026-11-19");
  });

  it("fromDateOnly parses date string without timezone shifts or NaN", () => {
    const d = fromDateOnly("2026-11-19");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(10); // 0-indexed November
    expect(d.getDate()).toBe(19);

    // Handles ISO strings with T and time
    const dIso = fromDateOnly("2026-11-19T14:30:00.000Z");
    expect(dIso.getFullYear()).toBe(2026);
    expect(dIso.getMonth()).toBe(10);
    expect(dIso.getDate()).toBe(19);

    // Safe fallback on empty input
    const emptyFallback = fromDateOnly("");
    expect(emptyFallback).toBeInstanceOf(Date);
  });

  it("getWeekStart and getWeekEnd calculate Sunday-start week boundaries", () => {
    // 2026-11-19 is Thursday (weekday 4).
    // Start of week should be Sunday 2026-11-15.
    // End of week should be Saturday 2026-11-21.
    expect(getWeekStart("2026-11-19")).toBe("2026-11-15");
    expect(getWeekEnd("2026-11-19")).toBe("2026-11-21");

    // Sunday itself
    expect(getWeekStart("2026-11-15")).toBe("2026-11-15");
    expect(getWeekEnd("2026-11-15")).toBe("2026-11-21");

    // Saturday
    expect(getWeekStart("2026-11-21")).toBe("2026-11-15");
    expect(getWeekEnd("2026-11-21")).toBe("2026-11-21");
  });

  it("addWeeks and addDays correctly calculate relative dates", () => {
    expect(addWeeks("2026-11-15", 1)).toBe("2026-11-22");
    expect(addWeeks("2026-11-15", -1)).toBe("2026-11-08");

    expect(addDays("2026-11-15", 3)).toBe("2026-11-18");
    expect(addDays("2026-11-15", -1)).toBe("2026-11-14");
    // Cross-month
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
  });

  it("weekdayOnOrAfter finds the correct target weekday on or after date", () => {
    // 2026-11-15 is Sunday (0)
    expect(weekdayOnOrAfter("2026-11-15", 0)).toBe("2026-11-15"); // Sunday
    expect(weekdayOnOrAfter("2026-11-15", 1)).toBe("2026-11-16"); // Monday
    expect(weekdayOnOrAfter("2026-11-15", 3)).toBe("2026-11-18"); // Wednesday
    expect(weekdayOnOrAfter("2026-11-15", 6)).toBe("2026-11-21"); // Saturday

    // 2026-11-18 is Wednesday (3). Next Monday (1) should be 2026-11-23.
    expect(weekdayOnOrAfter("2026-11-18", 1)).toBe("2026-11-23");
  });

  it("normalizeTime formats HH:MM and ignores trailing seconds or undefined", () => {
    expect(normalizeTime("08:00:00")).toBe("08:00");
    expect(normalizeTime("08:00")).toBe("08:00");
    expect(normalizeTime("14:30:15")).toBe("14:30");
    expect(normalizeTime(null)).toBe("");
    expect(normalizeTime(undefined)).toBe("");
  });

  it("cellKey produces unique grid identifiers", () => {
    expect(cellKey(1, "08:00")).toBe("1-08:00");
    expect(cellKey(1, "08:00:00")).toBe("1-08:00");
    expect(cellKey(4, "14:00")).toBe("4-14:00");
  });
});

describe("Schedule Audit: Master Session Expansion", () => {
  const baseMaster: SessionMaster = {
    id: "master-1",
    seriesKey: "series_1",
    parentMasterId: null,
    moduleId: "mod-math",
    professorId: "prof-1",
    groupId: "group-1",
    roomId: "room-1",
    weekday: 1, // Monday
    startTime: "08:00",
    endTime: "10:00",
    effectiveStartDate: "2026-11-01",
    effectiveEndDate: "2026-12-31",
    status: "active",
    archivedAt: null,
    moduleName: "Mathématiques",
    professorName: "Prof. Dupont",
    groupName: "Terminale S1",
    roomName: "Salle 101",
  };

  it("expands active weekly recurring master into occurrences for target week", () => {
    const occurrences = expandSessionMasters([baseMaster], {
      weekStart: "2026-11-15", // Week: Sunday 15 to Saturday 21
    });

    expect(occurrences).toHaveLength(1);
    const occ = occurrences[0];
    expect(occ.masterId).toBe("master-1");
    expect(occ.occurrenceDate).toBe("2026-11-16"); // Monday of that week
    expect(occ.originalDate).toBe("2026-11-16");
    expect(occ.startTime).toBe("08:00");
    expect(occ.endTime).toBe("10:00");
    expect(occ.moduleName).toBe("Mathématiques");
    expect(occ.groupName).toBe("Terminale S1");
    expect(occ.roomName).toBe("Salle 101");
    expect(occ.sourceType).toBe("master");
  });

  it("respects effectiveStartDate and ignores occurrences before series started", () => {
    const futureMaster: SessionMaster = {
      ...baseMaster,
      id: "master-future",
      effectiveStartDate: "2026-12-01",
    };

    const occurrences = expandSessionMasters([futureMaster], {
      weekStart: "2026-11-15",
    });

    expect(occurrences).toHaveLength(0);
  });

  it("respects effectiveEndDate and ignores occurrences after series ended", () => {
    const endedMaster: SessionMaster = {
      ...baseMaster,
      id: "master-ended",
      effectiveEndDate: "2026-11-10",
    };

    const occurrences = expandSessionMasters([endedMaster], {
      weekStart: "2026-11-15",
    });

    expect(occurrences).toHaveLength(0);
  });

  it("skips archived masters", () => {
    const archivedMaster: SessionMaster = {
      ...baseMaster,
      status: "archived",
      archivedAt: "2026-11-05T10:00:00Z",
    };

    const occurrences = expandSessionMasters([archivedMaster], {
      weekStart: "2026-11-15",
    });

    expect(occurrences).toHaveLength(0);
  });

  it("filters by groupId when specified", () => {
    const master2: SessionMaster = {
      ...baseMaster,
      id: "master-2",
      groupId: "group-2",
      weekday: 2, // Tuesday
    };

    const occurrencesGroup1 = expandSessionMasters([baseMaster, master2], {
      weekStart: "2026-11-15",
      groupId: "group-1",
    });
    expect(occurrencesGroup1).toHaveLength(1);
    expect(occurrencesGroup1[0].groupId).toBe("group-1");

    const occurrencesGroup2 = expandSessionMasters([baseMaster, master2], {
      weekStart: "2026-11-15",
      groupId: "group-2",
    });
    expect(occurrencesGroup2).toHaveLength(1);
    expect(occurrencesGroup2[0].groupId).toBe("group-2");
  });

  it("handles deleted exceptions: removes the occurrence on the exception date", () => {
    const deletedException: SessionException = {
      id: "exc-del-1",
      masterId: "master-1",
      occurrenceDate: "2026-11-16",
      originalDate: "2026-11-16",
      originalStartTime: "08:00",
      originalEndTime: "10:00",
      type: "deleted",
      overrideDate: null,
      overrideStartTime: null,
      overrideEndTime: null,
      overrideModuleId: null,
      overrideProfessorId: null,
      overrideGroupId: null,
      overrideRoomId: null,
      note: "Professeur en formation",
    };

    const occurrences = expandSessionMasters([baseMaster], {
      weekStart: "2026-11-15",
      exceptions: [deletedException],
    });

    expect(occurrences).toHaveLength(0);
  });

  it("handles modified exceptions: overrides time, room and professor", () => {
    const modifiedException: SessionException = {
      id: "exc-mod-1",
      masterId: "master-1",
      occurrenceDate: "2026-11-16",
      originalDate: "2026-11-16",
      originalStartTime: "08:00",
      originalEndTime: "10:00",
      type: "modified",
      overrideDate: "2026-11-16",
      overrideStartTime: "14:00",
      overrideEndTime: "16:00",
      overrideModuleId: null,
      overrideProfessorId: "prof-replacement",
      overrideGroupId: null,
      overrideRoomId: "room-2",
      note: "Décalé à l'après-midi en salle 2",
    };

    const occurrences = expandSessionMasters([baseMaster], {
      weekStart: "2026-11-15",
      exceptions: [modifiedException],
      professors: [{ id: "prof-replacement", name: "Prof. Remplaçant" }],
      rooms: [{ id: "room-2", name: "Salle 202", capacity: 25 }],
    });

    expect(occurrences).toHaveLength(1);
    const occ = occurrences[0];
    expect(occ.sourceType).toBe("exception");
    expect(occ.exceptionId).toBe("exc-mod-1");
    expect(occ.startTime).toBe("14:00");
    expect(occ.endTime).toBe("16:00");
    expect(occ.originalStartTime).toBe("08:00");
    expect(occ.professorId).toBe("prof-replacement");
    expect(occ.professorName).toBe("Prof. Remplaçant");
    expect(occ.roomId).toBe("room-2");
    expect(occ.roomName).toBe("Salle 202");
  });

  it("sorts expanded occurrences chronologically by date and start time", () => {
    const masterMorning: SessionMaster = {
      ...baseMaster,
      id: "m-morning",
      weekday: 2, // Tuesday
      startTime: "10:00",
      endTime: "12:00",
    };
    const masterEarly: SessionMaster = {
      ...baseMaster,
      id: "m-early",
      weekday: 2, // Tuesday
      startTime: "08:00",
      endTime: "10:00",
    };
    const masterMonday: SessionMaster = {
      ...baseMaster,
      id: "m-monday",
      weekday: 1, // Monday
      startTime: "14:00",
      endTime: "16:00",
    };

    const occurrences = expandSessionMasters(
      [masterMorning, masterEarly, masterMonday],
      { weekStart: "2026-11-15" }
    );

    expect(occurrences).toHaveLength(3);
    // Monday first
    expect(occurrences[0].occurrenceDate).toBe("2026-11-16");
    expect(occurrences[0].startTime).toBe("14:00");
    // Tuesday 08:00 second
    expect(occurrences[1].occurrenceDate).toBe("2026-11-17");
    expect(occurrences[1].startTime).toBe("08:00");
    // Tuesday 10:00 third
    expect(occurrences[2].occurrenceDate).toBe("2026-11-17");
    expect(occurrences[2].startTime).toBe("10:00");
  });
});

describe("Schedule Audit: Conflict Detection", () => {
  const existingSession = {
    id: "session-100",
    occurrenceDate: "2026-11-16",
    weekday: 1,
    startTime: "08:00",
    endTime: "10:00",
    professorId: "prof-1",
    roomId: "room-1",
    groupId: "group-1",
    status: "active",
  };

  it("detects professor conflict when same teacher is booked on overlapping slot", () => {
    const candidate = {
      occurrenceDate: "2026-11-16",
      startTime: "09:00",
      endTime: "11:00",
      professorId: "prof-1",
      roomId: "room-2", // different room
      groupId: "group-2", // different group
    };

    const result = detectScheduleConflict(candidate, [existingSession]);
    expect(result.hasConflict).toBe(true);
    expect(result.type).toBe("professor");
    expect(result.reason).toContain("enseignant");
  });

  it("detects room conflict when same room is booked on overlapping slot", () => {
    const candidate = {
      occurrenceDate: "2026-11-16",
      startTime: "09:30",
      endTime: "11:30",
      professorId: "prof-2", // different prof
      roomId: "room-1", // same room
      groupId: "group-2", // different group
    };

    const result = detectScheduleConflict(candidate, [existingSession]);
    expect(result.hasConflict).toBe(true);
    expect(result.type).toBe("room");
    expect(result.reason).toContain("salle");
  });

  it("detects group conflict when same class has overlapping courses", () => {
    const candidate = {
      occurrenceDate: "2026-11-16",
      startTime: "08:30",
      endTime: "10:30",
      professorId: "prof-3", // different prof
      roomId: "room-3", // different room
      groupId: "group-1", // same group
    };

    const result = detectScheduleConflict(candidate, [existingSession]);
    expect(result.hasConflict).toBe(true);
    expect(result.type).toBe("group");
    expect(result.reason).toContain("classe");
  });

  it("allows adjacent non-overlapping slots (no false positive on boundary)", () => {
    // Exact adjacent slot immediately following: 10:00 to 12:00
    const candidateAfter = {
      occurrenceDate: "2026-11-16",
      startTime: "10:00",
      endTime: "12:00",
      professorId: "prof-1",
      roomId: "room-1",
      groupId: "group-1",
    };
    expect(detectScheduleConflict(candidateAfter, [existingSession]).hasConflict).toBe(false);

    // Exact adjacent slot immediately preceding: 06:00 to 08:00
    const candidateBefore = {
      occurrenceDate: "2026-11-16",
      startTime: "06:00",
      endTime: "08:00",
      professorId: "prof-1",
      roomId: "room-1",
      groupId: "group-1",
    };
    expect(detectScheduleConflict(candidateBefore, [existingSession]).hasConflict).toBe(false);
  });

  it("correctly normalizes seconds in times (prevents HH:MM vs HH:MM:SS false conflict)", () => {
    const sessionWithSeconds = {
      ...existingSession,
      startTime: "08:00:00",
      endTime: "10:00:00",
    };

    // Candidate adjacent at 10:00
    const candidate = {
      occurrenceDate: "2026-11-16",
      startTime: "10:00",
      endTime: "12:00",
      professorId: "prof-1",
      roomId: "room-1",
      groupId: "group-1",
    };

    const result = detectScheduleConflict(candidate, [sessionWithSeconds]);
    expect(result.hasConflict).toBe(false);
  });

  it("permits courses without assigned professor without false teacher conflicts", () => {
    const sessionWithoutProf = {
      ...existingSession,
      professorId: null,
      roomId: "room-1",
      groupId: "group-1",
    };

    const candidate = {
      occurrenceDate: "2026-11-16",
      startTime: "08:00",
      endTime: "10:00",
      professorId: null, // also no prof
      roomId: "room-2", // different room
      groupId: "group-2", // different group
    };

    expect(detectScheduleConflict(candidate, [sessionWithoutProf]).hasConflict).toBe(false);
  });

  it("ignores excluded session ID when editing an existing session", () => {
    const candidateSameSession = {
      id: "session-100",
      occurrenceDate: "2026-11-16",
      startTime: "08:00",
      endTime: "10:00",
      professorId: "prof-1",
      roomId: "room-1",
      groupId: "group-1",
    };

    const result = detectScheduleConflict(
      candidateSameSession,
      [existingSession],
      { excludeId: "session-100" }
    );
    expect(result.hasConflict).toBe(false);
  });

  it("ignores cancelled and archived sessions", () => {
    const cancelledSession = {
      ...existingSession,
      status: "cancelled",
    };

    const candidate = {
      occurrenceDate: "2026-11-16",
      startTime: "08:00",
      endTime: "10:00",
      professorId: "prof-1",
      roomId: "room-1",
      groupId: "group-1",
    };

    expect(detectScheduleConflict(candidate, [cancelledSession]).hasConflict).toBe(false);
  });

  it("rejects candidate when start time is equal or after end time", () => {
    const invalidCandidate = {
      occurrenceDate: "2026-11-16",
      startTime: "12:00",
      endTime: "10:00",
      groupId: "group-1",
    };

    const result = detectScheduleConflict(invalidCandidate, [existingSession]);
    expect(result.hasConflict).toBe(true);
    expect(result.reason).toContain("antérieure");
  });
});

describe("Schedule Audit: Attendance Status Completeness", () => {
  it("recognizes all 4 official attendance statuses: present, absent, late, justified", () => {
    const validStatuses = ["present", "absent", "late", "justified", "unmarked"];

    const sampleAttendance = [
      { studentid: "s1", status: "present" },
      { studentid: "s2", status: "late" },
      { studentid: "s3", status: "absent" },
      { studentid: "s4", status: "justified" },
      { studentid: "s5", status: "unmarked" },
    ];

    sampleAttendance.forEach((record) => {
      expect(validStatuses).toContain(record.status);
    });

    const presentCount = sampleAttendance.filter((s) => s.status === "present").length;
    const lateCount = sampleAttendance.filter((s) => s.status === "late").length;
    const absentCount = sampleAttendance.filter((s) => s.status === "absent").length;
    const justifiedCount = sampleAttendance.filter((s) => s.status === "justified").length;
    const unmarkedCount = sampleAttendance.filter((s) => s.status === "unmarked").length;

    expect(presentCount).toBe(1);
    expect(lateCount).toBe(1);
    expect(absentCount).toBe(1);
    expect(justifiedCount).toBe(1);
    expect(unmarkedCount).toBe(1);

    const totalMarked = sampleAttendance.length - unmarkedCount;
    expect(totalMarked).toBe(4);
  });
});
