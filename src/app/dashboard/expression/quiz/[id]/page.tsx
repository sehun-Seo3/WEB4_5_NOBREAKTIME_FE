'use client'

import ExpressionIcon from '@/components/icon/expressionIcon'
import Image from 'next/image'
import { useParams } from 'next/navigation'
import { useEffect, useState, useCallback, useRef } from 'react'
import client from '@/lib/backend/client'
import type { components } from '@/lib/backend/apiV1/schema'
import QuizComplete from '@/components/learning/Quiz/QuizComplete'

type ExpressionQuizResponse = components['schemas']['ExpressionQuizResponse']
type ExpressionQuizItem = components['schemas']['ExpressionQuizItem']

const getBlankCount = (question?: string) => {
    const parts = question?.split(/({}\.?)/g) || []
    return parts.filter((part) => part.startsWith('{}')).length
}

export default function ExpressionQuiz() {
    const params = useParams()
    const expressionBookId = Number(params.id)
    const [quizData, setQuizData] = useState<ExpressionQuizResponse | null>(null)
    const [index, setIndex] = useState(0)
    const [isLoading, setIsLoading] = useState(true)
    const [blanks, setBlanks] = useState<string[]>([])
    const [usedChoices, setUsedChoices] = useState<number[]>([])
    const [isCorrect, setIsCorrect] = useState<boolean | null>(null)
    const [isCompleted, setIsCompleted] = useState(false)
    const [quizResults, setQuizResults] = useState<{
        [key: number]: {
            isCorrect: boolean | null
            blanks: string[]
            usedChoices: number[]
        }
    }>({})
    const [warningMessage, setWarningMessage] = useState(false)
    const [incorrectIndices, setIncorrectIndices] = useState<number[]>([])
    const originalResultsRef = useRef<typeof quizResults | null>(null)

    const resetQuiz = useCallback((targetIndex = index) => {
        if (!quizData?.quizItems) return
        const blankCount = getBlankCount(quizData.quizItems[targetIndex].question)
        setBlanks(Array(blankCount).fill(''))
        setUsedChoices([])
        setIsCorrect(null)
    }, [quizData, index])

    useEffect(() => {
        resetQuiz()
    }, [index, resetQuiz])

    const handleRestartQuiz = useCallback(() => {
        setQuizResults({})
        setIndex(0)
        setIsCompleted(false)
        setIncorrectIndices([])
        originalResultsRef.current = null
    }, [])

    const handleResetIncorrectQuiz = useCallback(() => {
        const incorrects = Object.entries(quizResults)
            .filter(([_, result]) => result.isCorrect === false)
            .map(([index]) => Number(index))

        if (incorrects.length > 0) {
            const newResults = Object.fromEntries(
                Object.entries(quizResults).filter(([index]) => incorrects.includes(Number(index)))
            )
            if (!originalResultsRef.current) {
                originalResultsRef.current = quizResults
            }
            setQuizResults(newResults)
            setIncorrectIndices(incorrects)
            setIndex(incorrects[0])
            setIsCorrect(null)
            setUsedChoices([])
            setBlanks([])
            setIsCompleted(false)
        }
    }, [quizResults])

    const handleNext = useCallback(() => {
        if (isCorrect === null) {
            setWarningMessage(true)
            return
        }

        if (!quizData?.quizItems) return

        const nextResults = {
            ...quizResults,
            [index]: {
                isCorrect,
                blanks,
                usedChoices,
            },
        }

        if (incorrectIndices.length > 0) {
            const currentIncorrectIndex = incorrectIndices.indexOf(index)
            const nextIncorrectIndex = incorrectIndices[currentIncorrectIndex + 1]
            if (nextIncorrectIndex !== undefined) {
                setQuizResults(nextResults)
                setIndex(nextIncorrectIndex)
            } else {
                const mergedResults = {
                    ...originalResultsRef.current,
                    ...nextResults,
                }
                setQuizResults(mergedResults)
                setIsCompleted(true)
                setIncorrectIndices([])
                originalResultsRef.current = null
            }
            return
        }

        if (index === quizData.quizItems.length - 1) {
            quizData.quizItems.forEach((_, idx) => {
                if (!nextResults[idx]) {
                    nextResults[idx] = {
                        isCorrect: false,
                        blanks: [],
                        usedChoices: [],
                    }
                }
            })
            setQuizResults(nextResults)
            setIsCompleted(true)
        } else {
            setQuizResults(nextResults)
            setIndex(index + 1)
        }
    }, [quizData, index, isCorrect, blanks, usedChoices, quizResults, incorrectIndices])

    useEffect(() => {
        const fetchQuiz = async () => {
            try {
                setIsLoading(true)
                const response = await client.GET('/api/v1/expressionbooks/{expressionBookId}/quiz', {
                    params: {
                        path: {
                            expressionBookId,
                        },
                    },
                })

                if (response.error || !response.data?.data) {
                    throw new Error('퀴즈 데이터 로드 실패')
                }

                const quizData = response.data.data
                setQuizData(quizData)
            } catch (error) {
                console.error('퀴즈 로드 실패:', error)
                alert('퀴즈를 불러오는데 실패했습니다.')
            } finally {
                setIsLoading(false)
            }
        }

        if (expressionBookId) {
            fetchQuiz()
        }
    }, [expressionBookId])

    useEffect(() => {
        if (quizData) {
            resetQuiz()
        }
    }, [quizData, resetQuiz])

    if (isLoading || !quizData?.quizItems) {
        return <div>Loading...</div>
    }

    if (isCompleted) {
        const totalCount = quizData.quizItems.length
        const correctCount = Object.values(quizResults).filter((result) => result.isCorrect).length
        const incorrectCount = Object.values(quizResults).filter((result) => result.isCorrect === false).length

        return (
            <QuizComplete
                quizType="expression"
                score={correctCount}
                totalCount={totalCount}
                incorrectCount={incorrectCount}
                onResetQuiz={handleResetIncorrectQuiz}
                onRestartQuiz={handleRestartQuiz}
            />
        )
    }

    const current = quizData.quizItems[index]
    const parts = current.question?.split(/({}\.?)/g) || []

    const handleChoice = (choice: string, idx: number) => {
        setWarningMessage(false)
        if (usedChoices.includes(idx)) {
            const choiceIndex = usedChoices.indexOf(idx)
            const newUsedChoices = usedChoices.filter((_, i) => i !== choiceIndex)
            setUsedChoices(newUsedChoices)

            const blankIndex = blanks.findIndex((b) => b === choice)
            if (blankIndex !== -1) {
                const newBlanks = [...blanks]
                newBlanks[blankIndex] = ''
                setBlanks(newBlanks)
            }
            return
        }

        const firstEmpty = blanks.findIndex((b) => b === '')
        if (firstEmpty === -1) return
        const newBlanks = [...blanks]
        newBlanks[firstEmpty] = choice
        setBlanks(newBlanks)
        setUsedChoices([...usedChoices, idx])
    }

    const handleSubmit = () => {
        if (blanks.includes('')) {
            setWarningMessage(true)
            return
        }

        const correctWords = current?.original?.split(/\s+/).map(w => w.replace(/[.,?!]/g, '')) || []
        const userWords = blanks.map(w => w.replace(/[.,?!]/g, ''))
        const isCorrectAnswer = userWords.every((w, i) => w === correctWords[i])

        setIsCorrect(isCorrectAnswer)

        const saveQuizResult = async () => {
            try {
                const response = await client.POST('/api/v1/expressionbooks/quiz/result', {
                    body: {
                        quizId: quizData?.quizId,
                        expressionBookId: current.expressionBookId,
                        expressionId: current.expressionId,
                        correct: isCorrectAnswer,
                    },
                })

                if (response.error) {
                    console.error('퀴즈 결과 저장 실패:', response.error)
                }
            } catch (error) {
                console.error('퀴즈 결과 저장 중 오류 발생:', error)
            }
        }

        saveQuizResult().then(() => {
            setQuizResults((prev) => ({
                ...prev,
                [index]: {
                    isCorrect: isCorrectAnswer,
                    blanks,
                    usedChoices,
                },
            }))
        })
    }

    const handlePrev = () => {
        if (index > 0) setIndex(index - 1)
    }

    return (
        <div className="h-screen overflow-y-auto bg-white">
            <div className="flex items-center gap-2">
                <span className="text-[var(--color-main)]">
                    <ExpressionIcon />
                </span>
                <h3 className="text-2xl font-bold text-[var(--color-black)]">Expression Quiz</h3>
            </div>
            <div className="bg-image p-20 flex flex-col gap-4 items-center">
                <h1 className="text-5xl font-bold text-[var(--color-black)]">문장 퀴즈</h1>

                <div className="flex flex-row justify-between gap-4 w-250">
                    <div className="bg-[var(--color-main)] text-[var(--color-point)] px-4 py-2 rounded-sm">
                        {index + 1} / {quizData.quizItems.length}
                    </div>
                </div>

                <div className="flex flex-col items-center justify-center bg-[var(--color-white)] w-250 h-full gap-8 p-12">
                    <div className="flex flex-col items-center w-full">
                        <div className="bg-gray-50 w-full py-6 rounded-lg mb-8">
                            <p className="text-xl text-gray-600 text-center px-4">{current.meaning}</p>
                        </div>
                        <div className="flex flex-wrap items-center justify-center gap-3 text-3xl font-bold text-center bg-white py-8 px-4 rounded-lg w-full">
                            <div className="relative w-full">
                                <div className="flex flex-wrap items-center justify-start gap-x-2 gap-y-4">
                                    {parts.map((part, idx) => {
                                        if (part.startsWith('{}')) {
                                            const hasDot = part.endsWith('.')
                                            return (
                                                <span key={idx} className="inline-flex items-center">
                                                    <span
                                                        className={`min-w-[100px] h-[40px] flex items-center justify-center bg-white border-2 rounded-lg text-base relative group ${blanks[
                                                            parts.slice(0, idx).filter((p) => p.startsWith('{}'))
                                                                .length
                                                        ]
                                                            ? isCorrect === null
                                                                ? 'border-[#D1CFFA] text-[#333333]'
                                                                : isCorrect
                                                                    ? 'border-green-500 text-green-600'
                                                                    : (() => {
                                                                        const currentIndex = parts
                                                                            .slice(0, idx)
                                                                            .filter((p) => p.startsWith('{}')).length
                                                                        const userWord = blanks[currentIndex]?.replace(/[.,]/g, '')
                                                                        const originalWords =
                                                                            current?.original?.split(' ').map((word) => word.replace(/[.,]/g, '')) || []
                                                                        const correctPositionIndex = originalWords.indexOf(userWord)
                                                                        return correctPositionIndex === -1 || correctPositionIndex !== currentIndex
                                                                            ? 'border-red-500 text-red-600 hover:cursor-help'
                                                                            : 'border-green-500 text-green-600'
                                                                    })()
                                                            : 'border-[#D1CFFA] bg-[#F5F3FF]'
                                                            }`}
                                                    >
                                                        {blanks[parts.slice(0, idx).filter((p) => p.startsWith('{}')).length] || ''}
                                                        {!isCorrect &&
                                                            isCorrect !== null &&
                                                            (() => {
                                                                const currentIndex = parts.slice(0, idx).filter((p) => p.startsWith('{}')).length
                                                                const userWord = blanks[currentIndex]?.replace(/[.,]/g, '')
                                                                const originalWords = current?.original?.split(' ').map((word) => word.replace(/[.,]/g, '')) || []
                                                                const correctWord = originalWords[currentIndex]
                                                                if (userWord !== correctWord) {
                                                                    return (
                                                                        <div className="absolute invisible group-hover:visible bg-black text-white text-sm px-2 py-1 rounded -top-8 left-1/2 transform -translate-x-1/2 whitespace-nowrap">
                                                                            정답: {correctWord}
                                                                        </div>
                                                                    )
                                                                }
                                                                return null
                                                            })()}
                                                    </span>
                                                    {hasDot && <span className="mr-1">.</span>}
                                                </span>
                                            )
                                        }
                                        return (
                                            <span key={idx} className="mx-1">
                                                {part}
                                            </span>
                                        )
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2 mb-4">
                        {current.choices?.map((choice, idx) => (
                            <button
                                key={idx}
                                className={`px-4 py-2 rounded-lg bg-[#ECEAFC] border-2 border-[#D1CFFA] text-[#6C2FFB] ${usedChoices.includes(idx) ? 'opacity-50' : ''
                                    }`}
                                onClick={() => handleChoice(choice, idx)}
                                disabled={isCorrect !== null || (!usedChoices.includes(idx) && blanks.every((b) => b !== ''))}
                            >
                                {choice}
                            </button>
                        ))}
                    </div>

                    <div className="flex flex-col items-center gap-2">
                        <button
                            className="w-18 h-18 disabled:opacity-50"
                            onClick={handleSubmit}
                            disabled={isCorrect !== null}
                        >
                            <Image
                                src={
                                    isCorrect === true
                                        ? '/assets/ok.svg'
                                        : isCorrect === false
                                            ? '/assets/fail.svg'
                                            : '/assets/check.svg'
                                }
                                alt="result"
                                width={80}
                                height={80}
                            />
                        </button>
                        <p className={`text-sm ${warningMessage ? 'text-red-500' : 'text-gray-500'}`}>
                            {warningMessage
                                ? '빈칸을 모두 채워주세요'
                                : isCorrect === null
                                    ? '정답 확인'
                                    : isCorrect
                                        ? '정답입니다!'
                                        : '틀렸습니다.'}
                        </p>
                    </div>

                    <div className="flex gap-2 w-full">
                        <button
                            onClick={handlePrev}
                            className="flex-1 flex items-center justify-center bg-[var(--color-sub-2)] border-[var(--color-main)] border-2 rounded-sm disabled:opacity-50"
                            disabled={index === 0}
                        >
                            <Image src="/assets/left.svg" alt="left" width={40} height={40} />
                        </button>
                        {index === quizData.quizItems.length - 1 ? (
                            <button
                                onClick={handleNext}
                                className="flex-1 py-2 bg-[var(--color-main)] text-white rounded-sm hover:bg-opacity-90"
                            >
                                최종 결과 확인
                            </button>
                        ) : (
                            <button
                                onClick={handleNext}
                                className="flex-1 flex items-center justify-center bg-[var(--color-sub-2)] border-[var(--color-main)] border-2 rounded-sm"
                            >
                                <Image src="/assets/right.svg" alt="right" width={40} height={40} />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
