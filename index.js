require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(
  express.urlencoded({
    extended: true,
  })
);
app.use(cors());

// Things todo

// 1. Scrape data into relevant JSONL file that can be uploaded
// 2. Connect GPT-3 with hyw2 credits and search with ada or babbage
// 3. Build simple frontend
// 4. Deploy to website

app.post('/api/search', async (req, res) => {
  const { query } = req.body;

  if (query == null || query.length < 5) {
    return res.send({
      success: false,
      error: 'Search query must be at least 5 characters long',
    });
  }

  try {
    const coursesResult = await axios.post(
      'https://api.openai.com/v1/engines/babbage/search',
      {
        file: process.env.COURSES_FILE_ID,
        max_rerank: 20,
        query,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.GPT3_TOKEN}`,
        },
      }
    );

    const coursesText = coursesResult.data.data;
    const sortedCoursesText = coursesText
      .filter((course) => course.score > 0)
      .sort((a, b) => b.score - a.score);

    const coursesParsed = sortedCoursesText.map((courseText) => {
      const courseName = courseText.text.substr(
        0,
        courseText.text.indexOf(':')
      );
      const splitName = courseName.split(' ');

      return {
        subject: splitName[0],
        number: splitName[1],
      };
    });

    const courseDataPromises = coursesParsed.map((course) => {
      const { subject, number } = course;
      return axios.get(
        `https://classes.cornell.edu/api/2.0/search/classes.json?roster=FA21&subject=${subject}&q=${number}`
      );
    });

    const coursesDataResult = await Promise.all(courseDataPromises);

    const courses = coursesDataResult.map((courseRes, i) => {
      const rawCourseData = courseRes.data.data.classes.find(
        (course) =>
          course.subject === coursesParsed[i].subject &&
          course.catalogNbr === coursesParsed[i].number
      );

      return extractCourseData(rawCourseData);
    });

    return res.send({ success: true, results: courses });
  } catch (err) {
    if (
      err.response.data != null &&
      err.response.data.error != null &&
      err.response.data.error.type === 'invalid_request_error'
    ) {
      return res.send({ success: true, results: [] });
    }
    return res.send({
      success: false,
      error: 'Error fetching results. Please try again later',
    });
  }
});

const extractCourseData = (course) => {
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

  const creditsRange =
    course.enrollGroups[0].unitsMinimum == course.enrollGroups[0].unitsMaximum
      ? `${course.enrollGroups[0].unitsMaximum}`
      : `${course.enrollGroups[0].unitsMinimum}-${course.enrollGroups[0].unitsMaximum}`;

  return {
    subject: course.subject,
    catalogNbr: course.catalogNbr,
    title: course.titleLong,
    description: course.description,
    credits: creditsRange,
    offered: course.catalogWhenOffered,
    acadGroup: course.acadGroup,
    distribution: course.catalogAttribute,
    instructors: uniqueInstructors.join(', '),
    grading: course.enrollGroups[0].gradingBasisLong,
    requisites: course.catalogPrereqCoreq,
  };
};

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
