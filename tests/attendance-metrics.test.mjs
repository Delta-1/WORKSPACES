import test from "node:test";
import assert from "node:assert/strict";
import { attendanceMetrics, durationLabel, contactDisplayName } from "../lib/attendance.ts";
const base={id:"1",conversation_id:"1",assignee_id:"1",sector_id:null,protocol:1,contact_name:"C",contact_phone:"55",employee_name:"A",queued_at:"2026-10-02T12:00:00Z",started_at:"2026-10-02T12:01:00Z",first_response_at:"2026-10-02T12:02:00Z",ended_at:"2026-10-02T12:06:00Z",outcome:"resolved",note:null,outgoing_count:3};
test('transfers and active sessions do not inflate completed count or resolution rate',()=>{const m=attendanceMetrics([base,{...base,id:"2",outcome:"transferred"},{...base,id:"3",outcome:"unresolved"},{...base,id:"4",outcome:null,ended_at:null}]);assert.equal(m.completed,2);assert.equal(m.resolutionRate,50);assert.equal(m.avgDuration,300);assert.equal(m.avgWait,60);assert.equal(m.avgFirstResponse,120);assert.equal(m.messages,12);assert.equal(m.active,1);});
test('empty reports use unknown instead of inventing an effectiveness score',()=>{assert.equal(attendanceMetrics([]).resolutionRate,null);assert.equal(attendanceMetrics([]).avgDuration,null);});
test('duration includes hours and never goes negative',()=>{assert.equal(durationLabel(3661),'01:01:01');assert.equal(durationLabel(-1),'00:00:00');});
test('saved name wins over profile name',()=>{assert.equal(contactDisplayName({saved_name:'Vanessa CP',name:'Vanessa',phone:'55'}),'Vanessa CP');});
