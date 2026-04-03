# Feature Specification: Interview Resume Library

**Feature Branch**: `001-interview-resume-library`  
**Created**: 2026-03-10  
**Status**: Draft  
**Input**: User description: "开发interview相关的后台页面，有增删改查的功能，其中新增、编辑，可以上传pdf分析简历信息用于填入表单，分析简历的接口目前已经存在。interview相关的后台接口就是一个简历库，简历库的数据库设计你可以参考目前简历分析会返回什么字段，可以参考来设计。然后简历库可以生成面试链接，可以到c端应用的interview页面，对应的路径是/interview/$id 这样，用户收到这个链接就可以进来面试了，对了简历库的表单还可以新增面试时间，面试时间可以有多个，比如说一面、二面、三面，还有当前面试流程等，在设计数据库的时候需要考虑。"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create and maintain candidate records (Priority: P1)

As an operations or recruiting user, I can create, view, edit, search, and delete interview candidate records in a centralized resume library so that interview preparation and follow-up are managed in one place.

**Why this priority**: The resume library is the core business capability. Without it, there is no manageable source of truth for candidate interview records.

**Independent Test**: Can be fully tested by creating a candidate record manually, updating it, locating it in the list, viewing details, and deleting it without relying on interview link delivery.

**Acceptance Scenarios**:

1. **Given** a recruiter is on the resume library page, **When** they create a new candidate record with required information, **Then** the record is saved and appears in the library list.
2. **Given** an existing candidate record, **When** the recruiter edits candidate details, interview schedule data, or current interview stage, **Then** the updated information is saved and visible in both list and detail views.
3. **Given** multiple candidate records exist, **When** the recruiter searches or filters the library, **Then** matching records are returned using candidate and interview-related information.
4. **Given** a candidate record that is no longer needed, **When** the recruiter deletes it, **Then** it is removed from the active library and no longer appears in default list results.

---

### User Story 2 - Create records from resume PDFs (Priority: P2)

As an operations or recruiting user, I can upload a candidate's resume PDF during create or edit so that known resume details are analyzed and used to prefill the form, reducing manual entry.

**Why this priority**: Resume analysis materially improves efficiency, but the library still delivers value with manual entry alone.

**Independent Test**: Can be fully tested by uploading a valid PDF during record creation or editing and confirming that extracted fields are proposed or filled into the form while preserving the ability to manually correct them.

**Acceptance Scenarios**:

1. **Given** a recruiter is creating a candidate record, **When** they upload a valid resume PDF, **Then** the form is populated with extracted candidate information from the resume analysis result.
2. **Given** resume analysis returns incomplete or partially missing information, **When** the form is filled, **Then** the recruiter can review and manually complete or correct any field before saving.
3. **Given** a recruiter is editing an existing record, **When** they upload a new resume PDF, **Then** the system updates the draft form values from the newly analyzed resume without silently losing manually entered notes or scheduling data.

---

### User Story 3 - Generate interview access links (Priority: P3)

As an operations or recruiting user, I can generate and copy a candidate-specific interview link from the resume library so that the candidate can open the interview page directly and complete the interview flow.

**Why this priority**: Interview execution depends on a shareable candidate entry point, but record management and resume intake can still be validated before link sharing is added.

**Independent Test**: Can be fully tested by generating a link from a candidate record, opening that link, and confirming the candidate lands on the correct interview entry page tied to that record.

**Acceptance Scenarios**:

1. **Given** a candidate record exists, **When** the recruiter generates an interview link, **Then** the system provides a unique link associated with that candidate record.
2. **Given** a candidate receives the generated link, **When** they open it, **Then** they arrive at the interview page for that specific candidate record.
3. **Given** a candidate record has moved through multiple interview rounds, **When** the recruiter views or shares the link, **Then** the current interview stage shown to internal users remains consistent with that record's latest stage.

### Edge Cases

- Resume analysis succeeds but returns only partial profile data; the form should remain editable and saveable with recruiter corrections.
- A recruiter uploads a non-PDF file, an unreadable PDF, or an oversized file; the system should reject it with a clear message and preserve other form input.
- A recruiter replaces the resume while editing an existing candidate; schedule entries, process stage, and internal notes should not be erased unless explicitly changed.
- A candidate record contains multiple interview rounds with missing dates for future rounds; the system should allow planned rounds to exist without requiring all rounds to be completed.
- A generated interview link is opened for a deleted or unavailable record; the candidate should see a clear unavailable state instead of a broken page.
- Search results should remain understandable when multiple candidates share the same name or target role.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide an internal resume library page that lists interview candidate records.
- **FR-002**: The system MUST allow authorized internal users to create a candidate record manually without requiring resume analysis.
- **FR-003**: The system MUST allow authorized internal users to create a candidate record by uploading a resume PDF and using the returned analysis data to prefill form fields.
- **FR-004**: The system MUST allow authorized internal users to edit an existing candidate record, including candidate information, resume-derived information, interview scheduling information, process stage, notes, and link-sharing status information.
- **FR-005**: The system MUST allow authorized internal users to delete a candidate record from the resume library.
- **FR-006**: The system MUST store a candidate profile that can represent at minimum the fields currently returned by resume analysis, including candidate name, age, gender, target roles, work years, skills, schools, work experiences, project experiences, and personal strengths.
- **FR-007**: The system MUST preserve the original resume file name and the latest analyzed resume profile associated with a candidate record.
- **FR-008**: The system MUST allow internal users to review and override any resume-derived field before saving a candidate record.
- **FR-009**: The system MUST support multiple interview schedule entries for a single candidate record, with each entry able to represent a distinct round such as first interview, second interview, or third interview.
- **FR-010**: The system MUST allow each interview schedule entry to record its round label, planned interview time, and relevant internal notes.
- **FR-011**: The system MUST maintain a current interview process stage for each candidate record so internal users can understand overall progress at a glance.
- **FR-012**: The system MUST provide searchable and filterable views of the resume library using candidate and interview-related information.
- **FR-013**: The system MUST generate a unique interview access link for each candidate record that can be shared with the candidate.
- **FR-014**: The system MUST ensure each generated interview access link resolves to the candidate-facing interview page for the associated candidate record.
- **FR-015**: The system MUST make it possible for internal users to copy or otherwise retrieve the generated interview access link from the resume library interface.
- **FR-016**: The system MUST show clear feedback when resume analysis fails, and MUST allow the internal user to continue manual entry without losing already entered form data.
- **FR-017**: The system MUST record when a candidate record is created and last updated for internal auditing and operational tracking.
- **FR-018**: The system MUST keep candidate notes separate from resume-derived content so internal comments remain editable without re-running resume analysis.

### Key Entities *(include if feature involves data)*

- **Candidate Interview Record**: The main resume library item representing one candidate's interview workflow, including identity information, resume summary, current process stage, notes, audit timestamps, and the shareable interview link.
- **Resume Profile**: The structured candidate information extracted from the uploaded resume, including personal basics, target roles, skills, education, work experiences, project experiences, and personal strengths.
- **Interview Schedule Entry**: A dated interview round belonging to a candidate record, used to capture one or more planned interview sessions such as first, second, or third round, plus round-specific notes.
- **Interview Access Link**: A unique candidate-facing entry point associated with one candidate record and used to open the interview page for that record.

### Assumptions

- The existing resume analysis capability remains available and continues returning the current structured resume profile fields.
- Only authenticated internal back-office users can manage the resume library.
- One candidate interview record corresponds to one shareable interview entry point, even if the candidate progresses through multiple interview rounds.
- Interview rounds are managed as multiple schedule entries under a single candidate record rather than separate candidate records.
- Internal users may manually create or complete records when no resume is available or when analysis is incomplete.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Internal users can create a new candidate record from the resume library in under 5 minutes, including at least one interview round.
- **SC-002**: In usability testing, at least 90% of uploaded valid resume PDFs populate at least one candidate field without requiring a second upload attempt.
- **SC-003**: At least 95% of candidate-specific interview links opened by testers route to the intended candidate interview page on the first attempt.
- **SC-004**: At least 90% of test users can find, edit, and update an existing candidate record within 2 minutes.
- **SC-005**: At least 90% of test users can add multiple interview rounds to one candidate record without assistance.
