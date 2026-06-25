window.BENCHMARK_DATA = {
  "lastUpdate": 1782416495092,
  "repoUrl": "https://github.com/Zanders214/daw",
  "entries": {
    "ZandersDAW engine": [
      {
        "commit": {
          "author": {
            "email": "152227414+Zanders214@users.noreply.github.com",
            "name": "Dennis Zanders",
            "username": "Zanders214"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "aaab7954897f113610e76f1628bbf8c731753df6",
          "message": "Merge pull request #41 from Zanders214/ci/perf-dashboard\n\nci(host): nanobench perf-trend dashboard for the audio engine",
          "timestamp": "2026-06-25T21:43:09+03:00",
          "tree_id": "62d36a046eca2d66bc284af006180cdef7b5b386",
          "url": "https://github.com/Zanders214/daw/commit/aaab7954897f113610e76f1628bbf8c731753df6"
        },
        "date": 1782413157726,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "engineBlock",
            "value": 16288.952,
            "unit": "ns/block"
          },
          {
            "name": "DSP load @48k/512",
            "value": 0.153,
            "unit": "%"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "152227414+Zanders214@users.noreply.github.com",
            "name": "Dennis Zanders",
            "username": "Zanders214"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "5c6cf30bc37e85fe0c4065b7259a1de47e05c704",
          "message": "Merge pull request #42 from Zanders214/fix/modal-a11y-keyboard\n\nfix(ui): make Sessions & Settings modals Escape-dismissable (Sonar S1082)",
          "timestamp": "2026-06-25T22:39:14+03:00",
          "tree_id": "01d3a72b29a23bffac3ea37c4dcbd9d2a4ef7127",
          "url": "https://github.com/Zanders214/daw/commit/5c6cf30bc37e85fe0c4065b7259a1de47e05c704"
        },
        "date": 1782416494701,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "engineBlock",
            "value": 16211.812,
            "unit": "ns/block"
          },
          {
            "name": "DSP load @48k/512",
            "value": 0.152,
            "unit": "%"
          }
        ]
      }
    ]
  }
}