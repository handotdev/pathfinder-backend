const fs = require('fs');
const axios = require('axios');
const { subjectMap, acadGroupMap } = require('./map');

const fetchAllSubjects = async () => {
  const subjectResults = await axios.get(
    'https://classes.cornell.edu/api/2.0/config/subjects.json?roster=FA21'
  );

  const subjects = subjectResults.data.data.subjects;

  return subjects;
};

const getSubjectSlugs = (subjects) => {
  return subjects.map((subject) => subject.value);
};

const getCoursesFromSubject = async (roster, subject) => {
  const subjectResults = await axios.get(
    `https://classes.cornell.edu/api/2.0/search/classes.json?roster=${roster}&subject=${subject}`
  );

  return subjectResults.data.data.classes;
};

const extractCourseData = (course) => {
  console.log(course);
  const instructors = course.enrollGroups[0].classSections.map(
    (classSection) => {
      if (
        classSection == null ||
        classSection.meetings == null ||
        classSection.meetings[0] == null
      )
        return [];
      return classSection.meetings[0].instructors;
    }
  );

  const instructorsFlat = instructors.flat(1);
  const uniqueInstructors = [
    ...new Set(
      instructorsFlat.map(
        (ins) => `${ins.firstName} ${ins.lastName} (${ins.netid})`
      )
    ),
  ];

  const co = {
    subject: course.subject,
    subjectLong: subjectMap[course.subject.toUpperCase()],
    catalogNbr: course.catalogNbr,
    titleLong: course.titleLong,
    description: course.description,
    offered: course.catalogWhenOffered,
    acadGroupShort: course.acadGroup,
    acadGroupLong: acadGroupMap[course.acadGroup],
    gradingBasisShort: course.enrollGroups[0].gradingBasis,
    gradingBasisLong: course.enrollGroups[0].gradingBasisLong,
    session: course.enrollGroups[0].sessionLong,
    creditsMin: course.enrollGroups[0].unitsMinimum,
    creditsMax: course.enrollGroups[0].unitsMaximum,
    catalogAttribute: course.catalogAttribute,
    instructors: uniqueInstructors,
  };

  const creditsRange =
    co.creditsMin == co.creditsMax
      ? `${co.creditsMax}`
      : `${co.creditsMin}-${co.creditsMax}`;

  return `${co.subject} ${co.catalogNbr}: ${co.titleLong}. ${co.subjectLong}. ${
    co.description
  }. Offered in ${co.offered}. ${co.acadGroupLong} (${
    co.acadGroupShort
  }). Grading is ${co.gradingBasisLong} (${
    co.gradingBasisShort
  }). Available in ${co.session} ${creditsRange} credits. ${
    co.catalogAttribute
  }. Instructors ${co.instructors.join(', ')}`;
};

const generateCoursesFile = async () => {
  const subjects = await fetchAllSubjects();
  const slugs = getSubjectSlugs(subjects);

  const subjectsPromises = slugs.map(async (slug) =>
    getCoursesFromSubject('FA21', slug)
  );

  const allSubjectsCourses = await Promise.all(subjectsPromises);
  let results = '';
  allSubjectsCourses.forEach((subjectCourses) => {
    subjectCourses.map((course) => {
      const parsedCourse = extractCourseData(course);
      results += `{"text":${parsedCourse}}\n`;
    });
  });

  fs.writeFile('courses.jsonl', results, (err) => {
    if (err) {
      console.error(err);
      return;
    }
    console.log('File successfully generated');
  });
};

// generateCoursesFile();
