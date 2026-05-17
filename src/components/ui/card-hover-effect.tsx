/* eslint-disable prettier/prettier */
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import MeetingModel from "../MeetingModel";
import { useModal } from "@/components/ui/animated-modal";
import { useRouter } from "next/navigation";


export const HoverEffect = ({
    items,
    className,
}: {
    items: {
        title: string;
        description: string;
        LogoImg: string;
        type: 'isInstantMeeting' | 'isScheduleMeeting' | 'isJoinMeeting' | 'isRecordedMeeting' | 'isRecordedMeeting'
    }[];
    className?: string;
}) => {
    const router = useRouter()
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
    const { setOpen } = useModal();
    const [openType, setOpenType] = useState<'isInstantMeeting' | 'isScheduleMeeting' | 'isJoinMeeting' | 'isRecordedMeeting' | null>(null);
    const handleClick = (type: 'isInstantMeeting' | 'isScheduleMeeting' | 'isJoinMeeting' | 'isRecordedMeeting') => {
        if (type === 'isRecordedMeeting') {
            router.push('/recording');
        } else {
            setOpenType(type);
            setOpen(true);
        }
    }
    return (
        <div
            className={cn(
                "grid grid-cols-1 gap-3 py-6 text-sm sm:grid-cols-2 md:gap-4 lg:mt-[100px] lg:grid-cols-3 lg:py-10",
                className,
            )}
        >
            {items.map((item, idx) => (
                <a
                    key={item?.LogoImg}
                    className="relative group block h-full w-full p-1.5 sm:p-2"
                    onMouseEnter={() => setHoveredIndex(idx)}
                    onMouseLeave={() => setHoveredIndex(null)}
                    onClick={() => handleClick(item.type)}

                >
                    <AnimatePresence>
                        {hoveredIndex === idx && (
                            <motion.span
                                className="absolute inset-0 h-full w-full bg-neutral-200 dark:bg-slate-800/[0.8] block rounded-3xl"
                                layoutId="hoverBackground"
                                initial={{ opacity: 0 }}
                                animate={{
                                    opacity: 1,
                                    transition: { duration: 0.15 },
                                }}
                                exit={{
                                    opacity: 0,
                                    transition: { duration: 0.15, delay: 0.2 },
                                }}
                            />
                        )}
                    </AnimatePresence>
                    <Card>
                        <CardTitle>{item.title}</CardTitle>
                        <CardDescription>{item.description}</CardDescription>
                    </Card>
                </a>
            ))}

            {openType && <MeetingModel
                type={openType}
                onClose={() => {
                    setOpen(false);
                    setOpenType(null);
                }}
            />
            }
        </div>
    );
};

export const Card = ({
    className,
    children,
}: {
    className?: string;
    children: React.ReactNode;
}) => {
    return (
        <div
            className={cn(
                "relative z-20 h-full min-h-[150px] w-full cursor-pointer overflow-hidden rounded-lg border border-transparent bg-black p-4 group-hover:border-slate-700 dark:border-white/[0.2] sm:min-h-[180px]",
                className,
            )}
        >
            <div className="relative z-50">
                <div className="p-4">{children}</div>
            </div>
        </div>
    );
};

export const CardTitle = ({
    className,
    children,
}: {
    className?: string;
    children: React.ReactNode;
}) => {
    return (
        <h4 className={cn("mt-2 text-base font-bold text-zinc-100 sm:mt-4 sm:text-lg", className)}>
            {children}
        </h4>
    );
};

export const CardDescription = ({
    className,
    children,
}: {
    className?: string;
    children: React.ReactNode;
}) => {
    return (
        <p
            className={cn(
                "mt-4 text-sm leading-relaxed text-zinc-400 sm:mt-8",
                className,
            )}
        >
            {children}
        </p>
    );
};
