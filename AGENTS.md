# Aircastle agent instructions

These instructions apply to every agent working in this directory and its subdirectories, including planning, implementation, review, and delegated work.

## Primary motivation

The user's primary goal is to learn how to define desired outcomes and build rigorous verification methods before delegating implementation to AI. Treat this as a hard project requirement. Do not silently sacrifice that learning or the quality of verification to deliver code faster.

The project is an elegant, developer-first CMS built from scratch. It should become a complete, deployed product. The product provides real problems through which the user can learn to build the right thing and build it correctly.

TypeScript is a candidate, not a settled choice. Do not treat the language, framework, architecture, or feature set as decided without an explicit decision. Preserve the intent to build from scratch when choosing dependencies, and explain when a dependency would replace work the user intends to learn.

## Establish that we are building the right thing

- Before implementing a feature, state the problem, intended user, and concrete workflow it should improve.
- Translate goals such as "elegant" and "excellent developer experience" into examples and observable acceptance criteria.
- For consequential design decisions, compare plausible alternatives and explain the tradeoffs. Do not adopt the first AI-generated solution without examining it.
- Use workflow walkthroughs, API usage examples, or small prototypes to examine uncertain product and design assumptions. Identify assumptions that still need evidence from real users or use.
- Keep product validation separate from implementation verification. Passing tests cannot establish that the chosen requirements solve a useful problem.

## Define verification before implementation

For each meaningful behavior change:

1. Make the expected behavior explicit, including relevant failure cases, constraints, and invariants.
2. Choose checks that can distinguish a correct result from plausible incorrect implementations. Explain what those checks establish and what they leave unverified.
3. Write or update the relevant tests before implementation. Run them and confirm that they fail because the required behavior is missing or wrong. Setup failures do not establish this.
4. Implement the smallest coherent change that satisfies the requirements, then run the checks and refactor while they remain passing.
5. Verify the actual behavior at the appropriate boundary. Report the evidence and any remaining uncertainty before declaring the work complete.

Derive expected results from the requirements independently of the implementation. Assert observable behavior rather than private structure. Use unit, integration, end-to-end, property-based, or other methods where they provide evidence for the specific claim; do not add test machinery merely to increase test counts or coverage.

Check the verification itself. Explain which realistic mistakes a test would catch, and use deliberate faults or mutation testing when stronger evidence is warranted. Do not let mocks replace the behavior a check claims to verify.

Do not weaken assertions, skip failing checks, or change expected results merely to make an implementation pass. If evidence shows a requirement or test is wrong, explain the correction and its effect on the intended behavior.

For work that does not change executable behavior, use an appropriate direct check of the artifact. Do not invent code tests for prose changes.

## Help the user learn and retain control

- Make reasoning about requirements, design alternatives, and verification visible and understandable. The user should be able to explain why a check is meaningful and challenge its assumptions.
- Work in small, verifiable steps so the user can examine the connection between an intended outcome, its checks, and the implementation.
- Establish the desired behavior and verification approach before autonomous implementation. Continue independently within established decisions; clarify unresolved decisions that materially change the product or learning goals.
- Treat generated code and generated tests as work to evaluate. Test counts, coverage, compilation, and an agent's confidence are insufficient evidence on their own.
- Include this motivation and the applicable acceptance criteria in delegated tasks and handoffs. Delegation must preserve the same requirements.
